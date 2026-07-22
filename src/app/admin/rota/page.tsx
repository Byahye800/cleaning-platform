'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { color, spacing, radius, font } from '@/lib/theme';

type JobRow = {
  id: string;
  client_id: string;
  cleaner_id: string | null;
  address: string;
  service_type: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  duration_hours: number | null;
  status: string;
};

type CleanerRow = { id: string; name: string };
type ClientRow = { id: string; name: string };

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

// Monday-start week, computed from calendar Y/M/D (not UTC parsing) so this
// can't shift a day depending on the viewer's timezone offset.
function startOfWeek(d: Date): Date {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = local.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(local, diff);
}

function withAlpha(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const UNASSIGNED_KEY = 'unassigned';
const JOB_SELECT = 'id, client_id, cleaner_id, address, service_type, scheduled_date, scheduled_time, duration_hours, status';

export default function AdminRotaPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [unscheduledJobs, setUnscheduledJobs] = useState<JobRow[]>([]);
  const [cleaners, setCleaners] = useState<CleanerRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ scheduled_time: string; cleaner_id: string }>({
    scheduled_time: '',
    cleaner_id: '',
  });

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekStartStr = formatDateOnly(days[0]);
  const weekEndStr = formatDateOnly(days[6]);

  useEffect(() => {
    (async () => {
      const [cleanersRes, clientsRes, unscheduledRes] = await Promise.all([
        supabase.from('cleaners').select('id, name').order('name', { ascending: true }).limit(200),
        supabase.from('clients').select('id, name').limit(500),
        // Not date-scoped like `jobs` below -- these have no scheduled_date at
        // all, so they can't appear in any week's grid. Fetched once here
        // rather than on every week navigation.
        supabase.from('jobs').select(JOB_SELECT).is('scheduled_date', null).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(100),
      ]);
      if (cleanersRes.error) setError(cleanersRes.error.message);
      else setCleaners((cleanersRes.data ?? []) as CleanerRow[]);
      if (clientsRes.error) setError(clientsRes.error.message);
      else setClients((clientsRes.data ?? []) as ClientRow[]);
      if (unscheduledRes.error) setError(unscheduledRes.error.message);
      else setUnscheduledJobs((unscheduledRes.data ?? []) as JobRow[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadJobs() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select(JOB_SELECT)
        .gte('scheduled_date', weekStartStr)
        .lte('scheduled_date', weekEndStr)
        .neq('status', 'cancelled')
        .order('scheduled_time', { ascending: true });
      if (error) throw error;
      setJobs((data ?? []) as JobRow[]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartStr, weekEndStr]);

  const jobsByCell = useMemo(() => {
    const map = new Map<string, JobRow[]>();
    for (const job of jobs) {
      if (!job.scheduled_date) continue;
      const key = `${job.cleaner_id ?? UNASSIGNED_KEY}|${job.scheduled_date}`;
      const list = map.get(key);
      if (list) list.push(job);
      else map.set(key, [job]);
    }
    return map;
  }, [jobs]);

  const rowDefs = useMemo(
    () => [{ id: UNASSIGNED_KEY, name: 'Unassigned' }, ...cleaners.map((c) => ({ id: c.id, name: c.name }))],
    [cleaners]
  );

  function openEdit(job: JobRow) {
    setEditingId(job.id);
    setEditForm({ scheduled_time: job.scheduled_time ?? '', cleaner_id: job.cleaner_id ?? '' });
  }

  async function saveEdit() {
    if (!editingId) return;
    const target = jobs.find((j) => j.id === editingId);
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      // Scheduling fields (cleaner_id, scheduled_date, scheduled_time,
      // duration_hours) are written exclusively through
      // admin_assign_job_schedule (SCHEDULE-INTEGRITY-001) -- this is the
      // only place in the app permitted to change them, and it rejects the
      // write server-side if it would double-book the cleaner. scheduled_date
      // and duration_hours aren't editable from this grid, so the job's
      // current values are passed through unchanged.
      const { error } = await supabase.rpc('admin_assign_job_schedule', {
        p_job_id: editingId,
        p_cleaner_id: editForm.cleaner_id || null,
        p_scheduled_date: target.scheduled_date,
        p_scheduled_time: editForm.scheduled_time || null,
        p_duration_hours: target.duration_hours,
      });
      if (error) throw error;
      setEditingId(null);
      await loadJobs();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const editingJob = editingId ? jobs.find((j) => j.id === editingId) ?? null : null;
  const todayStr = formatDateOnly(new Date());

  return (
    <div>
      <h2 style={{ marginBottom: 14 }}>Rota</h2>

      {error && <div style={errorStyle}>{error}</div>}

      <div style={toolbarStyle}>
        <button onClick={() => setWeekStart((w) => addDays(w, -7))} style={navBtnStyle} title="Previous week">
          <ChevronLeft size={16} />
        </button>
        <div style={{ fontWeight: font.weight.medium, minWidth: 220, textAlign: 'center' }}>
          {days[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          {' – '}
          {days[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
        <button onClick={() => setWeekStart((w) => addDays(w, 7))} style={navBtnStyle} title="Next week">
          <ChevronRight size={16} />
        </button>
        <button onClick={() => setWeekStart(startOfWeek(new Date()))} style={{ ...navBtnStyle, width: 'auto', padding: '0 12px' }}>
          This week
        </button>
        {loading && <span style={{ color: color.textSecondary, fontSize: font.size.sm }}>Loading…</span>}
      </div>

      {editingJob && (
        <section style={editSectionStyle}>
          <h3 style={{ marginTop: 0 }}>Edit job</h3>
          <div style={{ marginBottom: spacing.md, color: color.textSecondary, fontSize: font.size.base }}>
            {editingJob.address} — {clients.find((c) => c.id === editingJob.client_id)?.name ?? editingJob.client_id}
          </div>
          <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap' }}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Time</span>
              <input
                type="time"
                value={editForm.scheduled_time}
                onChange={(e) => setEditForm((p) => ({ ...p, scheduled_time: e.target.value }))}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Cleaner</span>
              <select
                value={editForm.cleaner_id}
                onChange={(e) => setEditForm((p) => ({ ...p, cleaner_id: e.target.value }))}
                style={inputStyle}
              >
                <option value="">(unassigned)</option>
                {cleaners.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={saveEdit} disabled={busy} style={primaryBtn}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            <button onClick={() => setEditingId(null)} disabled={busy} style={secondaryBtn}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {unscheduledJobs.length > 0 && (
        <section style={unscheduledSectionStyle}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: spacing.xs }}>
            <AlertCircle size={16} color={color.warning} />
            Unscheduled jobs
          </h3>
          <div style={{ color: color.textSecondary, fontSize: font.size.sm, marginBottom: spacing.sm }}>
            These have no scheduled date, so they can&apos;t appear on the calendar below. Assign a date via the Jobs page.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            {unscheduledJobs.map((job) => (
              <div key={job.id} style={unscheduledRowStyle}>
                <span style={{ fontWeight: font.weight.medium }}>{job.address}</span>
                <span style={{ color: color.textSecondary }}>{clients.find((c) => c.id === job.client_id)?.name ?? job.client_id}</span>
                <span style={{ color: color.textSecondary }}>
                  {job.cleaner_id ? cleaners.find((c) => c.id === job.cleaner_id)?.name ?? job.cleaner_id : '(unassigned)'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div style={gridWrapperStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(7, minmax(150px, 1fr))`, minWidth: 1200 }}>
          <div style={cornerCellStyle} />
          {days.map((d) => {
            const isToday = formatDateOnly(d) === todayStr;
            return (
              <div key={d.toISOString()} style={{ ...dayHeaderCellStyle, ...(isToday ? todayHeaderStyle : {}) }}>
                {d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
            );
          })}

          {rowDefs.map((row) => {
            const isUnassigned = row.id === UNASSIGNED_KEY;
            const rowBg = isUnassigned ? withAlpha(color.warning, 0.08) : undefined;
            return (
              <div key={row.id} style={{ display: 'contents' }}>
                <div style={{ ...rowHeaderStyle, background: rowBg }}>
                  {isUnassigned && <AlertCircle size={14} color={color.warning} />}
                  <span style={isUnassigned ? { color: color.warning, fontWeight: font.weight.medium } : undefined}>{row.name}</span>
                </div>
                {days.map((d) => {
                  const dateStr = formatDateOnly(d);
                  const cellJobs = jobsByCell.get(`${row.id}|${dateStr}`) ?? [];
                  return (
                    <div key={dateStr} style={{ ...cellStyle, background: rowBg }}>
                      {cellJobs.map((job) => (
                        <button
                          key={job.id}
                          onClick={() => openEdit(job)}
                          style={{
                            ...jobCardStyle,
                            background: isUnassigned ? withAlpha(color.warning, 0.15) : withAlpha(color.navy, 0.06),
                            borderColor: isUnassigned ? withAlpha(color.warning, 0.4) : color.border,
                          }}
                          title="Click to edit time or reassign"
                        >
                          <div style={{ fontWeight: font.weight.medium }}>{job.scheduled_time ? job.scheduled_time.slice(0, 5) : '—'}</div>
                          <div style={{ color: color.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {job.address}
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.sm,
  marginBottom: spacing.lg,
};

const navBtnStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: radius.md,
  border: `1px solid ${color.border}`,
  background: color.white,
  color: color.gray900,
  cursor: 'pointer',
};

const gridWrapperStyle: React.CSSProperties = {
  overflow: 'auto',
  maxHeight: 'calc(100vh - 320px)',
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
};

const cornerCellStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  left: 0,
  zIndex: 2,
  background: color.white,
  borderBottom: `1px solid ${color.border}`,
  borderRight: `1px solid ${color.border}`,
};

const dayHeaderCellStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: color.white,
  padding: spacing.sm,
  fontSize: font.size.sm,
  fontWeight: font.weight.medium,
  color: color.textSecondary,
  borderBottom: `1px solid ${color.border}`,
  borderRight: `1px solid ${color.border}`,
  textAlign: 'center',
};

const todayHeaderStyle: React.CSSProperties = {
  color: color.navy,
  background: withAlpha(color.navy, 0.06),
};

const rowHeaderStyle: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  background: color.white,
  padding: spacing.sm,
  fontSize: font.size.base,
  color: color.textPrimary,
  borderBottom: `1px solid ${color.border}`,
  borderRight: `1px solid ${color.border}`,
  display: 'flex',
  alignItems: 'center',
  gap: spacing.xs,
};

const cellStyle: React.CSSProperties = {
  padding: spacing.xs,
  borderBottom: `1px solid ${color.border}`,
  borderRight: `1px solid ${color.border}`,
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
  minHeight: 56,
};

const jobCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '6px 8px',
  borderRadius: radius.sm,
  border: '1px solid transparent',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: font.size.sm,
  width: '100%',
};

const editSectionStyle: React.CSSProperties = {
  padding: spacing.lg,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  marginBottom: spacing.lg,
};

const unscheduledSectionStyle: React.CSSProperties = {
  padding: spacing.lg,
  border: `1px solid ${withAlpha(color.warning, 0.4)}`,
  borderRadius: radius.lg,
  marginBottom: spacing.lg,
  background: withAlpha(color.warning, 0.06),
};

const unscheduledRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: spacing.md,
  flexWrap: 'wrap',
  padding: spacing.sm,
  borderRadius: radius.md,
  border: `1px solid ${color.border}`,
  background: color.white,
  fontSize: font.size.base,
};

const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const labelTextStyle: React.CSSProperties = { fontSize: 12, color: color.textSecondary };

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${color.border}`,
  outline: 'none',
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${color.navy}`,
  background: color.navy,
  color: color.textInverse,
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${color.border}`,
  background: color.white,
  color: color.gray900,
  fontWeight: 600,
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  padding: 10,
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: color.error,
  borderRadius: 8,
  marginBottom: 12,
};
