'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

type ClientRow = { id: string; user_id: string; name: string; status: string };
type JobRow = {
  id: string;
  status: string;
  address: string;
  service_type: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  cleaner_id: string | null;
};
type Issue = {
  id: string;
  job_id: string;
  description: string;
  status: string;
  reported_by_role: string;
  resolution_notes: string | null;
  created_at: string;
};
type IssueComment = { id: string; issue_id: string; author_role: string; body: string; created_at: string };

const MAX_ISSUE_TEXT_LENGTH = 2000;

// Small local component, not a new file: keeps client/jobs/page.tsx from
// becoming a monolith while staying inside this cycle's approved file
// boundary (CLIENT-ISSUES-001 approves modifying this file, not adding
// new component files). Purely presentational + its own small bit of
// input state -- all data loading and mutation stays in the parent so
// there is a single source of truth for issuesByJob/issueCommentsByIssue.
function IssueThread({
  jobId,
  issues,
  commentsByIssue,
  loading,
  busyKey,
  error,
  onReportIssue,
  onReplyToIssue,
}: {
  jobId: string;
  issues: Issue[];
  commentsByIssue: Record<string, IssueComment[]>;
  loading: boolean;
  busyKey: string | null;
  error: string | null;
  onReportIssue: (jobId: string, description: string) => Promise<void>;
  onReplyToIssue: (jobId: string, issueId: string, body: string) => Promise<void>;
}) {
  const [newIssueText, setNewIssueText] = useState('');
  const [replyText, setReplyText] = useState<Record<string, string>>({});

  const reportBusyKey = `report:${jobId}`;
  const isReportBusy = busyKey === reportBusyKey;
  const trimmedNewIssue = newIssueText.trim();
  const newIssueTooLong = trimmedNewIssue.length > MAX_ISSUE_TEXT_LENGTH;

  async function submitReport() {
    if (!trimmedNewIssue || newIssueTooLong || isReportBusy) return;
    await onReportIssue(jobId, trimmedNewIssue);
    setNewIssueText('');
  }

  return (
    <div style={threadWrapStyle}>
      {error && <div style={errorTextStyle}>{error}</div>}
      {loading ? (
        <div style={mutedStyle}>Loading issues…</div>
      ) : issues.length === 0 ? (
        <div style={mutedStyle}>No issues reported for this job yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {issues.map((issue) => {
            const replyBusyKey = `reply:${issue.id}`;
            const isReplyBusy = busyKey === replyBusyKey;
            const trimmedReply = (replyText[issue.id] ?? '').trim();
            const replyTooLong = trimmedReply.length > MAX_ISSUE_TEXT_LENGTH;
            return (
              <div key={issue.id} style={issueCardStyle}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={statusBadgeStyle(issue.status)}>{issue.status}</span>
                  <span style={mutedSmallStyle}>{new Date(issue.created_at).toLocaleString()}</span>
                </div>
                <div style={{ marginTop: 6 }}>{issue.description}</div>
                {issue.resolution_notes && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                    Resolution notes: {issue.resolution_notes}
                  </div>
                )}
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(commentsByIssue[issue.id] ?? []).length === 0 ? (
                    <div style={mutedSmallStyle}>No replies yet.</div>
                  ) : (
                    (commentsByIssue[issue.id] ?? []).map((c) => (
                      <div key={c.id} style={{ fontSize: 13 }}>
                        <strong>{c.author_role}</strong>: {c.body}{' '}
                        <span style={mutedSmallStyle}>({new Date(c.created_at).toLocaleString()})</span>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <textarea
                    style={textareaStyle}
                    placeholder="Reply…"
                    maxLength={MAX_ISSUE_TEXT_LENGTH}
                    value={replyText[issue.id] ?? ''}
                    onChange={(e) => setReplyText((prev) => ({ ...prev, [issue.id]: e.target.value }))}
                  />
                  <button
                    style={btnStyle}
                    disabled={isReplyBusy || !trimmedReply || replyTooLong}
                    onClick={async () => {
                      await onReplyToIssue(jobId, issue.id, trimmedReply);
                      setReplyText((prev) => ({ ...prev, [issue.id]: '' }));
                    }}
                  >
                    {isReplyBusy ? 'Replying…' : 'Reply'}
                  </button>
                </div>
                {replyTooLong && <div style={errorTextStyle}>Reply is too long (maximum {MAX_ISSUE_TEXT_LENGTH} characters).</div>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Report an issue</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <textarea
            style={textareaStyle}
            placeholder="Describe the issue…"
            maxLength={MAX_ISSUE_TEXT_LENGTH}
            value={newIssueText}
            onChange={(e) => setNewIssueText(e.target.value)}
          />
          <button style={btnStyle} disabled={isReportBusy || !trimmedNewIssue || newIssueTooLong} onClick={submitReport}>
            {isReportBusy ? 'Reporting…' : 'Report issue'}
          </button>
        </div>
        {newIssueTooLong && <div style={errorTextStyle}>Description is too long (maximum {MAX_ISSUE_TEXT_LENGTH} characters).</div>}
      </div>
    </div>
  );
}

export default function ClientJobsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);

  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [issuesByJob, setIssuesByJob] = useState<Record<string, Issue[]>>({});
  const [commentsByIssue, setCommentsByIssue] = useState<Record<string, IssueComment[]>>({});
  const [issuesLoadingJobId, setIssuesLoadingJobId] = useState<string | null>(null);
  const [issueBusyKey, setIssueBusyKey] = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);

  async function load() {
    if (!supabase) return;
    setBusy(true); setError(null);
    try {
      const sd = await supabase.auth.getSession();
      const user = sd.data.session?.user;
      if (!user) { setError('Sign in required.'); return; }
      const cl = await supabase.from('clients').select('id,user_id,name,status').eq('user_id', user.id).maybeSingle();
      if (cl.error) throw cl.error;
      if (!cl.data) { setError('Profile not found.'); return; }
      const jr = await supabase
        .from('jobs_client_safe')
        .select('id,status,address,service_type,scheduled_date,scheduled_time,cleaner_id')
        .eq('client_id', cl.data.id)
        .order('scheduled_date', { ascending: true })
        .limit(200);
      if (jr.error) throw jr.error;
      setClient(cl.data as ClientRow);
      setJobs((jr.data ?? []) as JobRow[]);
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load().catch(() => {}); }, []); // eslint-disable-line

  // Only called on expand (and after a report/reply), never eagerly for
  // every row -- avoids loading every issue thread for every job up front.
  async function loadIssuesForJob(jobId: string) {
    setIssuesLoadingJobId(jobId);
    setIssueError(null);
    try {
      const issuesRes = await supabase
        .from('issues')
        .select('id,job_id,description,status,reported_by_role,resolution_notes,created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });
      if (issuesRes.error) throw issuesRes.error;
      const issuesData = (issuesRes.data ?? []) as Issue[];

      const issueIds = issuesData.map((i) => i.id);
      const commentsRes =
        issueIds.length > 0
          ? await supabase
              .from('issue_comments')
              .select('id,issue_id,author_role,body,created_at')
              .in('issue_id', issueIds)
              .order('created_at', { ascending: true })
          : { data: [] as IssueComment[], error: null };
      if (commentsRes.error) throw commentsRes.error;

      const byIssue: Record<string, IssueComment[]> = {};
      for (const c of (commentsRes.data ?? []) as IssueComment[]) {
        (byIssue[c.issue_id] ??= []).push(c);
      }
      setIssuesByJob((prev) => ({ ...prev, [jobId]: issuesData }));
      setCommentsByIssue((prev) => ({ ...prev, ...byIssue }));
    } catch (e) {
      setIssueError(getErrorMessage(e));
    } finally {
      setIssuesLoadingJobId(null);
    }
  }

  function toggleExpand(jobId: string) {
    setIssueError(null);
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      return;
    }
    setExpandedJobId(jobId);
    if (!issuesByJob[jobId]) {
      loadIssuesForJob(jobId).catch(() => {});
    }
  }

  async function handleReportIssue(jobId: string, description: string) {
    const key = `report:${jobId}`;
    setIssueBusyKey(key);
    setIssueError(null);
    try {
      const { error: rpcError } = await supabase.rpc('client_report_issue', {
        p_job_id: jobId,
        p_description: description,
      });
      if (rpcError) throw rpcError;
      await loadIssuesForJob(jobId);
    } catch (e) {
      setIssueError(getErrorMessage(e));
    } finally {
      setIssueBusyKey(null);
    }
  }

  async function handleReplyToIssue(jobId: string, issueId: string, body: string) {
    const key = `reply:${issueId}`;
    setIssueBusyKey(key);
    setIssueError(null);
    try {
      const { error: rpcError } = await supabase.rpc('client_add_issue_comment', {
        p_issue_id: issueId,
        p_body: body,
      });
      if (rpcError) throw rpcError;
      await loadIssuesForJob(jobId);
    } catch (e) {
      setIssueError(getErrorMessage(e));
    } finally {
      setIssueBusyKey(null);
    }
  }

  const th = { textAlign: 'left' as const, fontSize: 12, color: '#6b7280', padding: '10px 8px', borderBottom: '1px solid #e5e7eb' };
  const td = { padding: '10px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 13, verticalAlign: 'top' as const };

  return (
    <div>
      <h2>My Jobs</h2>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <p>{busy ? 'Loading...' : client ? 'Hi ' + client.name : 'Not signed in'}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Scheduled</th>
            <th style={th}>Address</th>
            <th style={th}>Service</th>
            <th style={th}>Status</th>
            <th style={th}>Cleaner assigned</th>
            <th style={th}>Issues</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => {
            const isExpanded = expandedJobId === j.id;
            return (
              <Fragment key={j.id}>
                <tr>
                  <td style={td}>{[j.scheduled_date, j.scheduled_time].filter(Boolean).join(' ') || '-'}</td>
                  <td style={td}>{j.address}</td>
                  <td style={td}>{j.service_type ?? '-'}</td>
                  <td style={td}>{j.status}</td>
                  <td style={td}>{j.cleaner_id ? 'Assigned' : 'Not yet assigned'}</td>
                  <td style={td}>
                    <button style={linkBtnStyle} onClick={() => toggleExpand(j.id)}>
                      {isExpanded ? 'Hide' : 'View / report'}
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td style={{ ...td, borderBottom: '1px solid #f1f5f9' }} colSpan={6}>
                      <IssueThread
                        jobId={j.id}
                        issues={issuesByJob[j.id] ?? []}
                        commentsByIssue={commentsByIssue}
                        loading={issuesLoadingJobId === j.id}
                        busyKey={issueBusyKey}
                        error={issueError}
                        onReportIssue={handleReportIssue}
                        onReplyToIssue={handleReplyToIssue}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {jobs.length === 0 && <tr><td style={td} colSpan={6}>No jobs yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const threadWrapStyle: React.CSSProperties = { padding: '12px 4px' };
const mutedStyle: React.CSSProperties = { color: '#6b7280', fontSize: 13 };
const mutedSmallStyle: React.CSSProperties = { color: '#6b7280', fontSize: 12 };
const errorTextStyle: React.CSSProperties = { color: '#b91c1c', fontSize: 12, marginTop: 4 };
const issueCardStyle: React.CSSProperties = { padding: 12, border: '1px solid #e5e7eb', borderRadius: 8 };
const textareaStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 200,
  minHeight: 40,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  fontSize: 13,
  fontFamily: 'inherit',
};
const btnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #111827',
  background: '#111827',
  color: 'white',
  fontSize: 13,
  cursor: 'pointer',
};
const linkBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid #e5e7eb',
  background: 'white',
  color: '#111827',
  fontSize: 12,
  cursor: 'pointer',
};

function statusBadgeStyle(status: string): React.CSSProperties {
  const colors: Record<string, string> = { open: '#b91c1c', reopened: '#b45309', resolved: '#15803d' };
  const c = colors[status] ?? '#6b7280';
  return {
    fontSize: 12,
    fontWeight: 600,
    color: c,
    background: `${c}26`,
    padding: '2px 8px',
    borderRadius: 999,
  };
}
