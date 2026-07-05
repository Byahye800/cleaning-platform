export type ActivityRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
};

export function describeActivity(row: ActivityRow, jobLabel: string, actorName: string): string {
  switch (row.action) {
    case 'job.created':
      return `${actorName} created ${jobLabel}`;
    case 'job.started':
      return `${actorName} started ${jobLabel}`;
    case 'job.completed':
      return `${actorName} marked ${jobLabel} completed`;
    case 'invoice.sent':
      return `${actorName} sent an invoice for ${jobLabel}`;
    case 'invoice.paid':
      return `Payment received for ${jobLabel}`;
    case 'invoice.failed':
      return `Payment failed for ${jobLabel}`;
    case 'job.status_changed':
      return `${actorName} updated ${jobLabel}'s status`;
    default:
      return `${actorName} — ${row.action} on ${jobLabel}`;
  }
}
