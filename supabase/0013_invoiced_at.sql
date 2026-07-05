-- Adds jobs.invoiced_at so revenue reporting can bucket by "when this job was
-- actually invoiced" instead of scheduled_date. The dashboard's revenue
-- snapshot and the new /admin/financials page were both bucketing by
-- scheduled_date as a stand-in, which is wrong for any job invoiced in a
-- different month than it was scheduled (e.g. a job scheduled next month but
-- already invoiced today shows £0 revenue this month, and vice versa).
--
-- Nullable, set once by src/app/api/stripe/send-invoice/route.ts at the same
-- point stripe_invoice_id is written (i.e. once Stripe has actually
-- finalized+sent the invoice, not at the earlier atomic payment_status
-- claim, which can still fail and retry).
--
-- Known gap: jobs invoiced before this migration ships will have
-- invoiced_at = null and will not appear in invoiced_at-bucketed revenue
-- history or aging buckets. Deliberately not backfilled from scheduled_date
-- -- that would just reintroduce the same bug for historical rows.
alter table public.jobs
  add column if not exists invoiced_at timestamptz;
