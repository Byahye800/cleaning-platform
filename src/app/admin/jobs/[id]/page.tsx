'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { color, spacing, radius, font } from '@/lib/theme';
import DetailField from '@/components/DetailField';
import ActivityFeed, { type ActivityItem } from '../../_dashboard/ActivityFeed';
import { describeActivity, type ActivityRow } from '@/lib/activity';

type Job = {
  id: string;
  client_id: string;
  cleaner_id: string | null;
  address: string;
  service_type: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  duration_hours: number | null;
  price: number | null;
  notes: string | null;
  status: string;
  payment_status: string;
};

type ChecklistItem = { id: string; label: string; is_checked: boolean; checked_at: string | null; sort_order: number };

type Issue = {
  id: string;
  job_id: string;
  description: string;
  status: string;
  reported_by_role: string;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};
type IssueComment = { id: string; issue_id: string; author: string; author_role: string; body: string; created_at: string };

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [job, setJob] = useState<Job | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [cleanerName, setCleanerName] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issueComments, setIssueComments] = useState<Record<string, IssueComment[]>>({});
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [issueBusyId, setIssueBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function getActorId() {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  }

  // issue_comments' author is scoped to a specific issue_id, so it can't be
  // fetched until the issue ids are known -- same two-phase shape already
  // used below for activity_log's actor lookup. Wrapped in one function so
  // the initial load and post-write reloads (reply/resolve/reopen) share it.
  async function loadIssues() {
    const issuesRes = await supabase
      .from('issues')
      .select('id,job_id,description,status,reported_by_role,resolution_notes,resolved_by,resolved_at,created_at')
      .eq('job_id', id)
      .order('created_at', { ascending: false });
    if (issuesRes.error) throw issuesRes.error;
    const issuesData = (issuesRes.data ?? []) as Issue[];

    const issueIds = issuesData.map((i) => i.id);
    const commentsRes =
      issueIds.length > 0
        ? await supabase
            .from('issue_comments')
            .select('id,issue_id,author,author_role,body,created_at')
            .in('issue_id', issueIds)
            .order('created_at', { ascending: true })
        : { data: [] as IssueComment[], error: null };
    if (commentsRes.error) throw commentsRes.error;

    const byIssue: Record<string, IssueComment[]> = {};
    for (const c of (commentsRes.data ?? []) as IssueComment[]) {
      (byIssue[c.issue_id] ??= []).push(c);
    }
    setIssues(issuesData);
    setIssueComments(byIssue);
  }

  async function replyToIssue(issueId: string) {
    const body = (replyText[issueId] ?? '').trim();
    if (!body) return;
    setIssueBusyId(issueId);
    setError(null);
    try {
      const actorId = await getActorId();
      const { error: insError } = await supabase.from('issue_comments').insert({
        issue_id: issueId,
        author: actorId,
        author_role: 'admin',
        body,
      });
      if (insError) throw insError;
      setReplyText((prev) => ({ ...prev, [issueId]: '' }));
      await loadIssues();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setIssueBusyId(null);
    }
  }

  async function resolveIssue(issue: Issue) {
    const notes = window.prompt('Resolution notes (optional):', '');
    if (notes === null) return;
    setIssueBusyId(issue.id);
    setError(null);
    try {
      const actorId = await getActorId();
      const { error: updError } = await supabase
        .from('issues')
        .update({
          status: 'resolved',
          resolution_notes: notes.trim() === '' ? null : notes.trim(),
          resolved_by: actorId,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', issue.id);
      if (updError) throw updError;
      await loadIssues();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setIssueBusyId(null);
    }
  }

  async function reopenIssue(issue: Issue) {
    setIssueBusyId(issue.id);
    setError(null);
    try {
      const { error: updError } = await supabase.from('issues').update({ status: 'reopened' }).eq('id', issue.id);
      if (updError) throw updError;
      await loadIssues();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setIssueBusyId(null);
    }
  }

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        const jobRes = await supabase
          .from('jobs')
          .select('id, client_id, cleaner_id, address, service_type, scheduled_date, scheduled_time, duration_hours, notes, status')
          .eq('id', id)
          .maybeSingle();
        if (jobRes.error) throw jobRes.error;
        const jobRow = jobRes.data as Omit<Job, 'price' | 'payment_status'> | null;
        if (!jobRow) {
          setJob(null);
          return;
        }

        const [clientRes, cleanerRes, activityRes, checklistRes, billingRes] = await Promise.all([
          supabase.from('clients').select('name').eq('id', jobRow.client_id).maybeSingle(),
          jobRow.cleaner_id
            ? supabase.from('cleaners').select('name').eq('id', jobRow.cleaner_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from('activity_log')
            .select('id, actor_id, action, entity_type, entity_id, created_at')
            .eq('entity_type', 'job')
            .eq('entity_id', id)
            .order('created_at', { ascending: false }),
          supabase
            .from('job_checklist_items')
            .select('id,label,is_checked,checked_at,sort_order')
            .eq('job_id', id)
            .order('sort_order', { ascending: true }),
          supabase.from('job_billing').select('price, payment_status').eq('job_id', id).maybeSingle(),
        ]);
        if (clientRes.error) throw clientRes.error;
        if (cleanerRes.error) throw cleanerRes.error;
        if (activityRes.error) throw activityRes.error;
        if (checklistRes.error) throw checklistRes.error;
        if (billingRes.error) throw billingRes.error;

        const billing = billingRes.data as { price: number | null; payment_status: string } | null;
        const jobData: Job = { ...jobRow, price: billing?.price ?? null, payment_status: billing?.payment_status ?? 'unpaid' };
        setJob(jobData);

        setClientName((clientRes.data as { name: string } | null)?.name ?? null);
        setCleanerName((cleanerRes.data as { name: string } | null)?.name ?? null);
        setChecklistItems((checklistRes.data ?? []) as ChecklistItem[]);
        await loadIssues();

        const activity = (activityRes.data ?? []) as ActivityRow[];
        const actorIds = [...new Set(activity.map((r) => r.actor_id).filter((v): v is string => v !== null))];
        const actorsRes =
          actorIds.length > 0
            ? await supabase.from('cleaners').select('user_id, name').in('user_id', actorIds)
            : { data: [] as { user_id: string; name: string }[], error: null };
        if (actorsRes.error) throw actorsRes.error;
        const cleanerNameByUserId = new Map((actorsRes.data ?? []).map((c) => [c.user_id, c.name]));

        setActivityItems(
          activity.map((row) => {
            const actorName = row.actor_id === null ? 'Stripe' : cleanerNameByUserId.get(row.actor_id) ?? 'Admin';
            return {
              id: row.id,
              description: describeActivity(row, 'this job', actorName),
              createdAt: row.created_at,
            };
          })
        );
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, id]);

  if (loading) return <div>Loading…</div>;
  if (error) return <div style={errorBoxStyle}>{error}</div>;
  if (!job) return <div style={errorBoxStyle}>Job not found (or RLS denied SELECT).</div>;

  return (
    <div>
      <Link href="/admin/jobs" style={{ fontSize: font.size.sm, color: color.textSecondary }}>
        ← Back to Jobs
      </Link>

      <h2 style={{ margin: `${spacing.lg}px 0` }}>{job.address}</h2>

      <section style={sectionStyle}>
        <div style={gridStyle}>
          <DetailField label="Client" value={<Link href={`/admin/clients/${job.client_id}`}>{clientName ?? job.client_id}</Link>} />
          <DetailField
            label="Assigned cleaner"
            value={job.cleaner_id ? <Link href={`/admin/cleaners/${job.cleaner_id}`}>{cleanerName ?? job.cleaner_id}</Link> : '(unassigned)'}
          />
          <DetailField label="Service type" value={job.service_type} />
          <DetailField label="Scheduled" value={[job.scheduled_date, job.scheduled_time].filter(Boolean).join(' ') || null} />
          <DetailField label="Duration" value={job.duration_hours != null ? `${job.duration_hours}h` : null} />
          <DetailField label="Price" value={job.price != null ? `£${job.price}` : null} />
          <DetailField label="Payment status" value={job.payment_status} />
          <DetailField label="Status" value={job.status} />
          <DetailField label="Notes" value={job.notes} />
        </div>
      </section>

      <section style={{ ...sectionStyle, marginTop: spacing.xl }}>
        <h3 style={{ marginTop: 0 }}>Checklist</h3>
        {checklistItems.length === 0 ? (
          <div style={{ color: color.textSecondary }}>No checklist for this job yet.</div>
        ) : (
          <div style={gridStyle}>
            {checklistItems.map((item) => (
              <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                <input type="checkbox" checked={item.is_checked} disabled />
                <span>{item.label}</span>
                {item.checked_at && (
                  <span style={{ fontSize: font.size.sm, color: color.textSecondary }}>
                    {new Date(item.checked_at).toLocaleString()}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </section>

      <section style={{ ...sectionStyle, marginTop: spacing.xl }}>
        <h3 style={{ marginTop: 0 }}>Issues</h3>
        {issues.length === 0 ? (
          <div style={{ color: color.textSecondary }}>No issues reported for this job.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
            {issues.map((issue) => (
              <div key={issue.id} style={issueCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                  <span style={issueStatusBadgeStyle(issue.status)}>{issue.status}</span>
                  <span style={{ fontSize: font.size.sm, color: color.textSecondary }}>
                    reported by {issue.reported_by_role} · {new Date(issue.created_at).toLocaleString()}
                  </span>
                </div>
                <div style={{ marginTop: spacing.sm }}>{issue.description}</div>
                {issue.resolution_notes && (
                  <div style={{ marginTop: spacing.sm, fontSize: font.size.sm, color: color.textSecondary }}>
                    Resolution notes: {issue.resolution_notes}
                  </div>
                )}

                <div style={{ marginTop: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  {(issueComments[issue.id] ?? []).length === 0 ? (
                    <div style={{ fontSize: font.size.sm, color: color.textSecondary }}>No replies yet.</div>
                  ) : (
                    (issueComments[issue.id] ?? []).map((c) => (
                      <div key={c.id} style={{ fontSize: font.size.sm }}>
                        <strong>{c.author_role}</strong>: {c.body}{' '}
                        <span style={{ color: color.textSecondary }}>({new Date(c.created_at).toLocaleString()})</span>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ marginTop: spacing.md, display: 'flex', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <textarea
                    style={textareaStyle}
                    placeholder="Reply…"
                    value={replyText[issue.id] ?? ''}
                    onChange={(e) => setReplyText((prev) => ({ ...prev, [issue.id]: e.target.value }))}
                  />
                  <button
                    style={btnStyle}
                    disabled={issueBusyId === issue.id || !(replyText[issue.id] ?? '').trim()}
                    onClick={() => replyToIssue(issue.id)}
                  >
                    {issueBusyId === issue.id ? 'Replying…' : 'Reply'}
                  </button>
                  {(issue.status === 'open' || issue.status === 'reopened') && (
                    <button style={btnStyle} disabled={issueBusyId === issue.id} onClick={() => resolveIssue(issue)}>
                      Resolve
                    </button>
                  )}
                  {issue.status === 'resolved' && (
                    <button style={btnStyle} disabled={issueBusyId === issue.id} onClick={() => reopenIssue(issue)}>
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ marginTop: spacing.xl }}>
        <ActivityFeed items={activityItems} />
      </div>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: spacing.lg,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: spacing.lg,
};

const errorBoxStyle: React.CSSProperties = {
  padding: 10,
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: '#b91c1c',
  borderRadius: 8,
};

const issueCardStyle: React.CSSProperties = {
  padding: spacing.md,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 200,
  minHeight: 40,
  padding: '8px 10px',
  borderRadius: radius.md,
  border: `1px solid ${color.border}`,
  fontSize: font.size.sm,
  fontFamily: font.family,
};

const btnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: radius.md,
  border: '1px solid #111827',
  background: '#111827',
  color: 'white',
  fontSize: font.size.sm,
  cursor: 'pointer',
};

function withAlpha(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const ISSUE_STATUS_COLORS: Record<string, string> = {
  open: color.error,
  reopened: color.warning,
  resolved: color.success,
};

function issueStatusBadgeStyle(status: string): React.CSSProperties {
  const c = ISSUE_STATUS_COLORS[status] ?? color.textSecondary;
  return {
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    color: c,
    background: withAlpha(c, 0.15),
    padding: '2px 8px',
    borderRadius: radius.full,
  };
}
