-- Phase 1 (Shift Status Lifecycle): adds jobs.shift_status as a new, unused,
-- nullable column. Purely additive -- jobs.status, cleaner_update_job_status,
-- canInvoice/invoiceDisabledReason, the Stripe webhook, revenue.ts, and the
-- Rota page's cancelled-job filter are all untouched and keep reading/writing
-- exactly what they do today. Nothing reads or writes shift_status yet; it's
-- wired into the UI in a later, separate phase once this is verified live.

alter table public.jobs
  add column if not exists shift_status text;
