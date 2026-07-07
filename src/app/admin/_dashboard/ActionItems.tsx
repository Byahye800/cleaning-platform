'use client';

import { useState } from 'react';
import Link from 'next/link';
import { color, spacing, radius, font } from '@/lib/theme';
import { invoiceDisabledReason } from '@/lib/jobInvoicing';

export type FailedInvoiceJob = { id: string; address: string; price: number | null };
export type CompletedNoInvoiceJob = { id: string; address: string; price: number | null };
export type UnassignedTodayJob = { id: string; address: string; scheduled_time: string | null };
export type OpenIssueJob = { id: string; job_id: string; address: string; description: string };

export default function ActionItems({
  failedInvoices,
  completedNoInvoice,
  unassignedToday,
  openIssues,
  onInvoiceSent,
}: {
  failedInvoices: FailedInvoiceJob[];
  completedNoInvoice: CompletedNoInvoiceJob[];
  unassignedToday: UnassignedTodayJob[];
  openIssues: OpenIssueJob[];
  onInvoiceSent: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendInvoice(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch('/api/stripe/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed to send invoice');
      onInvoiceSent();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  }

  const totalCount = failedInvoices.length + completedNoInvoice.length + unassignedToday.length + openIssues.length;

  return (
    <section style={sectionStyle}>
      <h3 style={{ marginTop: 0 }}>Needs your attention</h3>
      {error && <div style={errorStyle}>{error}</div>}
      {totalCount === 0 ? (
        <div style={{ color: color.textSecondary, fontSize: font.size.base }}>Nothing needs your attention.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          {failedInvoices.map((job) => (
            <ActionRow
              key={`failed-${job.id}`}
              description={`Invoice for ${job.address} failed to collect payment`}
              actionLabel={busyId === job.id ? 'Retrying…' : 'Retry invoice'}
              onAction={() => sendInvoice(job.id)}
              disabled={busyId !== null}
            />
          ))}
          {completedNoInvoice.map((job) => {
            const reason = invoiceDisabledReason({ status: 'completed', price: job.price, payment_status: 'unpaid' });
            return (
              <ActionRow
                key={`uninvoiced-${job.id}`}
                description={`${job.address} is completed but hasn't been invoiced yet`}
                actionLabel={busyId === job.id ? 'Sending…' : 'Send invoice'}
                onAction={() => sendInvoice(job.id)}
                disabled={busyId !== null || !!reason}
                disabledTitle={reason}
              />
            );
          })}
          {unassignedToday.map((job) => (
            <ActionRow
              key={`unassigned-${job.id}`}
              description={`${job.address} is scheduled today${job.scheduled_time ? ` at ${job.scheduled_time}` : ''} with no cleaner assigned`}
              actionLabel="Assign cleaner"
              href={`/admin/jobs?select=${job.id}`}
            />
          ))}
          {openIssues.map((issue) => (
            <ActionRow
              key={`issue-${issue.id}`}
              description={`Issue reported on ${issue.address}: ${issue.description}`}
              actionLabel="View issue"
              href={`/admin/jobs/${issue.job_id}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ActionRow({
  description,
  actionLabel,
  onAction,
  href,
  disabled,
  disabledTitle,
}: {
  description: string;
  actionLabel: string;
  onAction?: () => void;
  href?: string;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  return (
    <div style={rowStyle}>
      <div style={{ fontSize: font.size.base }}>{description}</div>
      {href ? (
        <Link href={href} style={actionBtnStyle}>
          {actionLabel}
        </Link>
      ) : (
        <button onClick={onAction} disabled={disabled} title={disabledTitle} style={actionBtnStyle}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: spacing.lg,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  marginBottom: spacing.xl,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing.md,
  padding: spacing.md,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  flexWrap: 'wrap',
};

const actionBtnStyle: React.CSSProperties = {
  padding: `${spacing.sm}px ${spacing.md}px`,
  borderRadius: radius.md,
  border: `1px solid ${color.accent}`,
  background: color.accent,
  color: color.textInverse,
  fontWeight: font.weight.medium,
  cursor: 'pointer',
  textDecoration: 'none',
  fontSize: font.size.sm,
  whiteSpace: 'nowrap',
};

const errorStyle: React.CSSProperties = {
  padding: spacing.md,
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: color.error,
  borderRadius: radius.md,
  marginBottom: spacing.md,
};
