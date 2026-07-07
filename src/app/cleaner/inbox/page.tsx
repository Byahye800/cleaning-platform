'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
type CleanerRow = { id: string; user_id: string; name: string; status: string; };
type JobRow = {
  id: string;
  status: string;
  address: string;
  service_type: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  notes: string | null;
  cleaner_id: string | null;
  created_at: string;
};
type ChecklistItem = { id: string; label: string; is_checked: boolean; checked_at: string | null; sort_order: number };
type Issue = { id: string; job_id: string; description: string; status: string; created_at: string };
type IssueComment = { id: string; issue_id: string; author: string; author_role: string; body: string; created_at: string };
export default function CleanerInboxPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleaner, setCleaner] = useState<CleanerRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [openAttendanceJobIds, setOpenAttendanceJobIds] = useState<Set<string>>(new Set());
  const [attendanceBusyId, setAttendanceBusyId] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [checklistsByJob, setChecklistsByJob] = useState<Record<string, ChecklistItem[]>>({});
  const [checklistLoadingId, setChecklistLoadingId] = useState<string | null>(null);
  const [checklistItemBusyId, setChecklistItemBusyId] = useState<string | null>(null);
  const [expandedIssuesJobId, setExpandedIssuesJobId] = useState<string | null>(null);
  const [issuesByJob, setIssuesByJob] = useState<Record<string, Issue[]>>({});
  const [issueCommentsByIssue, setIssueCommentsByIssue] = useState<Record<string, IssueComment[]>>({});
  const [issuesLoadingId, setIssuesLoadingId] = useState<string | null>(null);
  const [newIssueText, setNewIssueText] = useState<Record<string, string>>({});
  const [newReplyText, setNewReplyText] = useState<Record<string, string>>({});
  const [issueBusyId, setIssueBusyId] = useState<string | null>(null);
  async function load() {
    if (!supabase) return;
    setBusy(true); setError(null);
    try {
      const sd = await supabase.auth.getSession();
      const user = sd.data.session?.user;
      if (!user) { setError('Sign in required.'); return; }
      const cr = await supabase.from('cleaners').select('id,user_id,name,status').eq('user_id', user.id).maybeSingle();
      if (cr.error) throw cr.error;
      if (!cr.data) { setError('Profile not found.'); return; }
      const jr = await supabase
        .from('jobs')
        .select('id,status,address,service_type,scheduled_date,scheduled_time,notes,cleaner_id,created_at')
        .eq('cleaner_id', cr.data.id)
        .order('scheduled_date', { ascending: true })
        .limit(200);
      if (jr.error) throw jr.error;
      const ar = await supabase
        .from('attendance')
        .select('job_id')
        .eq('cleaner_id', cr.data.id)
        .is('check_out_at', null);
      if (ar.error) throw ar.error;
      setCleaner(cr.data as CleanerRow);
      setJobs((jr.data ?? []) as JobRow[]);
      setOpenAttendanceJobIds(new Set((ar.data ?? []).map((row: any) => row.job_id)));
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load().catch(() => {}); }, []); // eslint-disable-line

  async function updateStatus(jobId: string, newStatus: 'in_progress' | 'completed') {
    setUpdatingId(jobId);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('cleaner_update_job_status', {
        p_job_id: jobId,
        p_new_status: newStatus,
      });
      if (rpcError) throw rpcError;
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setUpdatingId(null);
    }
  }

  async function checkIn(jobId: string) {
    setAttendanceBusyId(jobId);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('cleaner_check_in', {
        p_job_id: jobId,
        p_user_agent: navigator.userAgent,
      });
      if (rpcError) throw rpcError;
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setAttendanceBusyId(null);
    }
  }

  async function checkOut(jobId: string) {
    setAttendanceBusyId(jobId);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('cleaner_check_out', {
        p_job_id: jobId,
        p_user_agent: navigator.userAgent,
      });
      if (rpcError) throw rpcError;
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setAttendanceBusyId(null);
    }
  }

  async function loadChecklist(jobId: string) {
    setChecklistLoadingId(jobId);
    setError(null);
    try {
      const { error: seedError } = await supabase.rpc('cleaner_seed_job_checklist', { p_job_id: jobId });
      if (seedError) throw seedError;
      const { data, error: selError } = await supabase
        .from('job_checklist_items')
        .select('id,label,is_checked,checked_at,sort_order')
        .eq('job_id', jobId)
        .order('sort_order', { ascending: true });
      if (selError) throw selError;
      setChecklistsByJob((prev) => ({ ...prev, [jobId]: (data ?? []) as ChecklistItem[] }));
    } catch (e) {
      setError(String(e));
    } finally {
      setChecklistLoadingId(null);
    }
  }

  async function toggleChecklistPanel(jobId: string) {
    if (expandedJobId === jobId) { setExpandedJobId(null); return; }
    setExpandedJobId(jobId);
    if (!checklistsByJob[jobId]) {
      await loadChecklist(jobId);
    }
  }

  async function toggleChecklistItem(jobId: string, itemId: string, checked: boolean) {
    setChecklistItemBusyId(itemId);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('cleaner_toggle_checklist_item', {
        p_item_id: itemId,
        p_checked: checked,
      });
      if (rpcError) throw rpcError;
      await loadChecklist(jobId);
    } catch (e) {
      setError(String(e));
    } finally {
      setChecklistItemBusyId(null);
    }
  }

  async function loadIssues(jobId: string) {
    setIssuesLoadingId(jobId);
    setError(null);
    try {
      const { data: issuesData, error: issuesError } = await supabase
        .from('issues')
        .select('id,job_id,description,status,created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });
      if (issuesError) throw issuesError;
      const issues = (issuesData ?? []) as Issue[];
      setIssuesByJob((prev) => ({ ...prev, [jobId]: issues }));

      const issueIds = issues.map((i) => i.id);
      const { data: commentsData, error: commentsError } =
        issueIds.length > 0
          ? await supabase
              .from('issue_comments')
              .select('id,issue_id,author,author_role,body,created_at')
              .in('issue_id', issueIds)
              .order('created_at', { ascending: true })
          : { data: [] as IssueComment[], error: null };
      if (commentsError) throw commentsError;
      const byIssue: Record<string, IssueComment[]> = {};
      for (const c of (commentsData ?? []) as IssueComment[]) {
        (byIssue[c.issue_id] ??= []).push(c);
      }
      setIssueCommentsByIssue((prev) => ({ ...prev, ...byIssue }));
    } catch (e) {
      setError(String(e));
    } finally {
      setIssuesLoadingId(null);
    }
  }

  async function toggleIssuesPanel(jobId: string) {
    if (expandedIssuesJobId === jobId) { setExpandedIssuesJobId(null); return; }
    setExpandedIssuesJobId(jobId);
    if (!issuesByJob[jobId]) {
      await loadIssues(jobId);
    }
  }

  async function reportIssue(jobId: string) {
    const description = (newIssueText[jobId] ?? '').trim();
    if (!description) return;
    setIssueBusyId(jobId);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('cleaner_report_issue', {
        p_job_id: jobId,
        p_description: description,
      });
      if (rpcError) throw rpcError;
      setNewIssueText((prev) => ({ ...prev, [jobId]: '' }));
      await loadIssues(jobId);
    } catch (e) {
      setError(String(e));
    } finally {
      setIssueBusyId(null);
    }
  }

  async function replyToIssue(jobId: string, issueId: string) {
    const body = (newReplyText[issueId] ?? '').trim();
    if (!body) return;
    setIssueBusyId(issueId);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('cleaner_add_issue_comment', {
        p_issue_id: issueId,
        p_body: body,
      });
      if (rpcError) throw rpcError;
      setNewReplyText((prev) => ({ ...prev, [issueId]: '' }));
      await loadIssues(jobId);
    } catch (e) {
      setError(String(e));
    } finally {
      setIssueBusyId(null);
    }
  }

  const th = { textAlign: 'left' as const, fontSize: 12, color: '#6b7280', padding: '10px 8px', borderBottom: '1px solid #e5e7eb' };
  const td = { padding: '10px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 13, verticalAlign: 'top' as const };
  const actionBtn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #111827', background: '#111827', color: 'white', fontSize: 12, cursor: 'pointer' };
  return (
    <div>
      <h2>Cleaner Inbox</h2>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <p>{busy ? 'Loading...' : cleaner ? 'Hi ' + cleaner.name : 'Not signed in'}</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Scheduled</th><th style={th}>Address</th><th style={th}>Service</th><th style={th}>Status</th><th style={th}>Notes</th><th style={th}>Attendance</th><th style={th}>Checklist</th><th style={th}>Issues</th><th style={th}>Action</th></tr></thead>
        <tbody>
          {jobs.map((j) => (
            <Fragment key={j.id}>
            <tr>
              <td style={td}>{[j.scheduled_date, j.scheduled_time].filter(Boolean).join(' ') || '-'}</td>
              <td style={td}>{j.address}</td>
              <td style={td}>{j.service_type ?? '-'}</td>
              <td style={td}>{j.status}</td>
              <td style={td}>{j.notes ?? '-'}</td>
              <td style={td}>
                {j.status === 'completed' ? (
                  '-'
                ) : openAttendanceJobIds.has(j.id) ? (
                  <button
                    style={actionBtn}
                    disabled={attendanceBusyId === j.id}
                    onClick={() => checkOut(j.id)}
                  >
                    {attendanceBusyId === j.id ? 'Saving…' : 'Check out'}
                  </button>
                ) : (
                  <button
                    style={actionBtn}
                    disabled={attendanceBusyId === j.id}
                    onClick={() => checkIn(j.id)}
                  >
                    {attendanceBusyId === j.id ? 'Saving…' : 'Check in'}
                  </button>
                )}
              </td>
              <td style={td}>
                <button style={actionBtn} onClick={() => toggleChecklistPanel(j.id)}>
                  {expandedJobId === j.id ? 'Hide checklist' : 'Show checklist'}
                </button>
              </td>
              <td style={td}>
                <button style={actionBtn} onClick={() => toggleIssuesPanel(j.id)}>
                  {expandedIssuesJobId === j.id ? 'Hide issues' : 'Show issues'}
                </button>
              </td>
              <td style={td}>
                {j.status === 'completed' ? (
                  '-'
                ) : j.status === 'in_progress' ? (
                  <button
                    style={actionBtn}
                    disabled={updatingId === j.id}
                    onClick={() => updateStatus(j.id, 'completed')}
                  >
                    {updatingId === j.id ? 'Saving…' : 'Mark completed'}
                  </button>
                ) : (
                  <button
                    style={actionBtn}
                    disabled={updatingId === j.id}
                    onClick={() => updateStatus(j.id, 'in_progress')}
                  >
                    {updatingId === j.id ? 'Saving…' : 'Start job'}
                  </button>
                )}
              </td>
            </tr>
            {expandedJobId === j.id && (
              <tr>
                <td style={td} colSpan={9}>
                  {checklistLoadingId === j.id ? 'Loading checklist…' : (
                    (checklistsByJob[j.id] ?? []).length === 0 ? 'No checklist items.' : (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {(checklistsByJob[j.id] ?? []).map((item) => (
                          <li key={item.id} style={{ marginBottom: 4 }}>
                            <label style={{ cursor: j.status === 'completed' ? 'default' : 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={item.is_checked}
                                disabled={j.status === 'completed' || checklistItemBusyId === item.id}
                                onChange={(e) => toggleChecklistItem(j.id, item.id, e.target.checked)}
                              />{' '}
                              {item.label}
                              {j.status === 'completed' && item.checked_at ? ` (checked ${new Date(item.checked_at).toLocaleString()})` : ''}
                            </label>
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </td>
              </tr>
            )}
            {expandedIssuesJobId === j.id && (
              <tr>
                <td style={td} colSpan={9}>
                  {issuesLoadingId === j.id ? 'Loading issues…' : (
                    <div>
                      <div style={{ marginBottom: 10 }}>
                        <textarea
                          style={{ width: '100%', minHeight: 50, fontSize: 13, padding: 6 }}
                          placeholder="Report an issue…"
                          value={newIssueText[j.id] ?? ''}
                          onChange={(e) => setNewIssueText((prev) => ({ ...prev, [j.id]: e.target.value }))}
                        />
                        <button
                          style={{ ...actionBtn, marginTop: 6 }}
                          disabled={issueBusyId === j.id || !(newIssueText[j.id] ?? '').trim()}
                          onClick={() => reportIssue(j.id)}
                        >
                          {issueBusyId === j.id ? 'Reporting…' : 'Report issue'}
                        </button>
                      </div>
                      {(issuesByJob[j.id] ?? []).length === 0 ? 'No issues reported for this job.' : (
                        <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                          {(issuesByJob[j.id] ?? []).map((issue) => (
                            <li key={issue.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
                              <div>
                                <strong>{issue.status}</strong> — {issue.description}{' '}
                                <span style={{ color: '#6b7280' }}>({new Date(issue.created_at).toLocaleString()})</span>
                              </div>
                              <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                                {(issueCommentsByIssue[issue.id] ?? []).map((c) => (
                                  <li key={c.id}>
                                    <strong>{c.author_role}</strong>: {c.body}{' '}
                                    <span style={{ color: '#6b7280' }}>({new Date(c.created_at).toLocaleString()})</span>
                                  </li>
                                ))}
                                {(issueCommentsByIssue[issue.id] ?? []).length === 0 && <li style={{ color: '#6b7280' }}>No replies yet.</li>}
                              </ul>
                              <textarea
                                style={{ width: '100%', minHeight: 40, fontSize: 13, padding: 6 }}
                                placeholder="Reply…"
                                value={newReplyText[issue.id] ?? ''}
                                onChange={(e) => setNewReplyText((prev) => ({ ...prev, [issue.id]: e.target.value }))}
                              />
                              <button
                                style={{ ...actionBtn, marginTop: 6 }}
                                disabled={issueBusyId === issue.id || !(newReplyText[issue.id] ?? '').trim()}
                                onClick={() => replyToIssue(j.id, issue.id)}
                              >
                                {issueBusyId === issue.id ? 'Replying…' : 'Reply'}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )}
            </Fragment>
          ))}
          {jobs.length === 0 && <tr><td style={td} colSpan={9}>No jobs assigned yet. Ask admin to assign one in Jobs.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
