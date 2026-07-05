// Shared invoice-eligibility rules for a job, used by both the admin Jobs page
// and the dashboard's action items so "can this be invoiced" can't drift
// between the two places that ask the question.
export type InvoiceEligibilityJob = {
  status: string;
  price: number | null;
  payment_status: string;
};

export function canInvoice(job: InvoiceEligibilityJob) {
  return job.status === 'completed' && job.price != null && (job.payment_status === 'unpaid' || job.payment_status === 'failed');
}

export function invoiceDisabledReason(job: InvoiceEligibilityJob): string | undefined {
  if (job.status !== 'completed') return 'Mark job completed first';
  if (job.price == null) return 'Job needs a price set';
  if (job.payment_status === 'invoiced') return 'Invoice already sent, awaiting payment';
  if (job.payment_status === 'paid') return 'Already paid';
  return undefined;
}
