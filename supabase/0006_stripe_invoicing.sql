-- 0006_stripe_invoicing.sql
--
-- Adds Stripe invoicing support: a Stripe customer reference per client, and
-- invoice tracking fields per job. Idempotent, same guard conventions as 0005 —
-- safe to run against a fresh database or the already-migrated live one.

alter table public.clients add column if not exists stripe_customer_id text;

alter table public.jobs add column if not exists stripe_invoice_id text;
alter table public.jobs add column if not exists payment_status text not null default 'unpaid';

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'jobs' and constraint_name = 'jobs_payment_status_check'
  ) then
    alter table public.jobs
      add constraint jobs_payment_status_check
      check (payment_status in ('unpaid', 'invoiced', 'paid', 'failed'));
  end if;
end $$;
