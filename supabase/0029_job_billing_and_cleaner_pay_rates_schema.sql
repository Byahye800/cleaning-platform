-- 0029_job_billing_and_cleaner_pay_rates_schema.sql
--
-- Captures public.set_updated_at(), public.job_billing, and
-- public.cleaner_pay_rates into a committed migration. All three objects
-- already exist live in production but were never created via a migration
-- file in this repository (confirmed via exhaustive repository search and
-- live production catalog inspection across five independent verification
-- passes: original verification, supplementary verification, migration
-- design review, adversarial review, and final pre-write hardening
-- verification). This migration repairs that repository drift.
--
-- Design notes:
--   * CREATE TABLE IF NOT EXISTS is used so a schema that already matches
--     (e.g. production, or a staging environment bootstrapped some other
--     way) is accepted without modification. A fail-fast structural
--     validation immediately follows each table's creation and runs BEFORE
--     any policy or trigger is dropped, so an existing table that does NOT
--     match the expected structure aborts the whole transaction rather than
--     being silently repaired or having its policies/triggers touched.
--   * set_updated_at() is CREATE OR REPLACE because it was independently
--     verified (schema-wide, unrestricted trigger-dependency query) to be
--     used exclusively by the two triggers this migration also owns.
--   * Production's function grant was verified to carry Supabase's default
--     unhardened EXECUTE grant to PUBLIC/anon/authenticated/service_role.
--     This migration explicitly revokes PUBLIC/anon/authenticated,
--     matching the exact precedent set by migrations 0022 and 0028
--     (STAGING-002). service_role and the function owner intentionally
--     retain EXECUTE, unchanged.
--   * No table-level GRANT/REVOKE statements are added: default ACL
--     behaviour was verified equivalent between staging and production.
--   * No production data is copied. No staging data is deleted. Neither
--     table is dropped. No unrelated schema object is touched.
--
-- Environment: written and tested against staging (jwdfzgibrijcyypibhjw)
-- only. Not applied to production (wqdyshgoxtkbreijbbha) as part of this
-- change; production application requires separate explicit approval.

begin;

-- ============================================================
-- 1. Shared trigger function
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

revoke all on function public.set_updated_at() from public;
revoke all on function public.set_updated_at() from anon;
revoke all on function public.set_updated_at() from authenticated;
-- service_role and the function owner (postgres) intentionally retain
-- EXECUTE, unchanged, matching the 0022/0028 precedent.

-- ============================================================
-- 2. public.job_billing
-- ============================================================

create table if not exists public.job_billing (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  payment_status text not null default 'unpaid',
  price numeric,
  stripe_invoice_id text,
  invoiced_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint job_billing_payment_status_check
    check (payment_status in ('unpaid', 'invoiced', 'paid', 'failed'))
);

alter table public.job_billing enable row level security;

-- Fail-fast structural validation. Must complete successfully before any
-- policy or trigger on this table is dropped or created.
do $val$
declare
  v_relkind "char";
  v_owner name;
  v_rls_enabled boolean;
  v_force_rls boolean;
  v_expected_cols text[] := array['job_id','payment_status','price','stripe_invoice_id','invoiced_at','updated_at'];
  v_actual_cols text[];
  v_missing text[];
  v_extra text[];
  v_col record;
  v_pk_cols text[];
  v_fk_count int;
  v_fk_col_ok boolean;
  v_check_def text;
begin
  select c.relkind, pg_get_userbyid(c.relowner), c.relrowsecurity, c.relforcerowsecurity
  into v_relkind, v_owner, v_rls_enabled, v_force_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'job_billing';

  if v_relkind is null then
    raise exception 'VALIDATION FAILED [job_billing]: table does not exist after CREATE TABLE IF NOT EXISTS';
  end if;

  if v_relkind <> 'r' then
    raise exception 'VALIDATION FAILED [job_billing]: relkind is %, expected ordinary table (r)', v_relkind;
  end if;

  if v_owner <> 'postgres' then
    raise exception 'VALIDATION FAILED [job_billing]: owner is %, expected postgres', v_owner;
  end if;

  select array_agg(attname order by attname) into v_actual_cols
  from pg_attribute
  where attrelid = 'public.job_billing'::regclass and attnum > 0 and not attisdropped;

  select array_agg(x) into v_missing from unnest(v_expected_cols) x where x <> all(v_actual_cols);
  select array_agg(x) into v_extra from unnest(v_actual_cols) x where x <> all(v_expected_cols);

  if v_missing is not null then
    raise exception 'VALIDATION FAILED [job_billing]: missing expected column(s): %', v_missing;
  end if;

  if v_extra is not null then
    raise exception 'VALIDATION FAILED [job_billing]: unexpected extra column(s): %', v_extra;
  end if;

  for v_col in
    select a.attname, format_type(a.atttypid, a.atttypmod) as data_type, a.attnotnull,
           pg_get_expr(d.adbin, d.adrelid) as default_expr
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'public.job_billing'::regclass and a.attnum > 0 and not a.attisdropped
  loop
    case v_col.attname
      when 'job_id' then
        if v_col.data_type <> 'uuid' then
          raise exception 'VALIDATION FAILED [job_billing.job_id]: type is %, expected uuid', v_col.data_type;
        end if;
        if v_col.attnotnull is not true then
          raise exception 'VALIDATION FAILED [job_billing.job_id]: must be NOT NULL';
        end if;
      when 'payment_status' then
        if v_col.data_type <> 'text' then
          raise exception 'VALIDATION FAILED [job_billing.payment_status]: type is %, expected text', v_col.data_type;
        end if;
        if v_col.attnotnull is not true then
          raise exception 'VALIDATION FAILED [job_billing.payment_status]: must be NOT NULL';
        end if;
        if v_col.default_expr is null or v_col.default_expr not ilike '%unpaid%' then
          raise exception 'VALIDATION FAILED [job_billing.payment_status]: default is %, expected ''unpaid''', v_col.default_expr;
        end if;
      when 'price' then
        if v_col.data_type <> 'numeric' then
          raise exception 'VALIDATION FAILED [job_billing.price]: type is %, expected numeric', v_col.data_type;
        end if;
        if v_col.attnotnull is true then
          raise exception 'VALIDATION FAILED [job_billing.price]: must be nullable';
        end if;
      when 'stripe_invoice_id' then
        if v_col.data_type <> 'text' then
          raise exception 'VALIDATION FAILED [job_billing.stripe_invoice_id]: type is %, expected text', v_col.data_type;
        end if;
        if v_col.attnotnull is true then
          raise exception 'VALIDATION FAILED [job_billing.stripe_invoice_id]: must be nullable';
        end if;
      when 'invoiced_at' then
        if v_col.data_type <> 'timestamp with time zone' then
          raise exception 'VALIDATION FAILED [job_billing.invoiced_at]: type is %, expected timestamptz', v_col.data_type;
        end if;
        if v_col.attnotnull is true then
          raise exception 'VALIDATION FAILED [job_billing.invoiced_at]: must be nullable';
        end if;
      when 'updated_at' then
        if v_col.data_type <> 'timestamp with time zone' then
          raise exception 'VALIDATION FAILED [job_billing.updated_at]: type is %, expected timestamptz', v_col.data_type;
        end if;
        if v_col.attnotnull is not true then
          raise exception 'VALIDATION FAILED [job_billing.updated_at]: must be NOT NULL';
        end if;
        if v_col.default_expr is null or v_col.default_expr not ilike '%now()%' then
          raise exception 'VALIDATION FAILED [job_billing.updated_at]: default is %, expected now()', v_col.default_expr;
        end if;
    end case;
  end loop;

  select array_agg(a.attname order by a.attname) into v_pk_cols
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = 'public.job_billing'::regclass and i.indisprimary;

  if v_pk_cols is distinct from array['job_id'] then
    raise exception 'VALIDATION FAILED [job_billing]: primary key columns are %, expected {job_id}', v_pk_cols;
  end if;

  select count(*) into v_fk_count
  from pg_constraint con
  join pg_class target on target.oid = con.confrelid
  join pg_namespace tn on tn.oid = target.relnamespace
  where con.conrelid = 'public.job_billing'::regclass
    and con.contype = 'f'
    and tn.nspname = 'public'
    and target.relname = 'jobs'
    and con.confdeltype = 'c';

  if v_fk_count <> 1 then
    raise exception 'VALIDATION FAILED [job_billing]: expected exactly one FK to public.jobs with ON DELETE CASCADE, found %', v_fk_count;
  end if;

  select exists (
    select 1
    from pg_constraint con
    join pg_class target on target.oid = con.confrelid
    where con.conrelid = 'public.job_billing'::regclass
      and con.contype = 'f'
      and target.relname = 'jobs'
      and con.confdeltype = 'c'
      and con.conkey = array[(select attnum from pg_attribute where attrelid = 'public.job_billing'::regclass and attname = 'job_id')]
  ) into v_fk_col_ok;

  if not v_fk_col_ok then
    raise exception 'VALIDATION FAILED [job_billing]: foreign key source column is not job_id';
  end if;

  select pg_get_constraintdef(con.oid) into v_check_def
  from pg_constraint con
  where con.conrelid = 'public.job_billing'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%payment_status%';

  if v_check_def is null
     or not (v_check_def ilike '%unpaid%' and v_check_def ilike '%invoiced%'
             and v_check_def ilike '%paid%' and v_check_def ilike '%failed%') then
    raise exception 'VALIDATION FAILED [job_billing]: payment_status check constraint missing or mismatched (found: %)', v_check_def;
  end if;

  if v_rls_enabled is not true then
    raise exception 'VALIDATION FAILED [job_billing]: row level security is not enabled';
  end if;

  if v_force_rls is true then
    raise exception 'VALIDATION FAILED [job_billing]: relforcerowsecurity is true, expected false';
  end if;

  raise notice 'VALIDATION PASSED [job_billing]: structure matches expected design';
end;
$val$;

-- ============================================================
-- 3. public.cleaner_pay_rates
-- ============================================================

create table if not exists public.cleaner_pay_rates (
  cleaner_id uuid primary key references public.cleaners(id) on delete cascade,
  hourly_rate numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.cleaner_pay_rates enable row level security;

do $val$
declare
  v_relkind "char";
  v_owner name;
  v_rls_enabled boolean;
  v_force_rls boolean;
  v_expected_cols text[] := array['cleaner_id','hourly_rate','updated_at'];
  v_actual_cols text[];
  v_missing text[];
  v_extra text[];
  v_col record;
  v_pk_cols text[];
  v_fk_count int;
  v_fk_col_ok boolean;
begin
  select c.relkind, pg_get_userbyid(c.relowner), c.relrowsecurity, c.relforcerowsecurity
  into v_relkind, v_owner, v_rls_enabled, v_force_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'cleaner_pay_rates';

  if v_relkind is null then
    raise exception 'VALIDATION FAILED [cleaner_pay_rates]: table does not exist after CREATE TABLE IF NOT EXISTS';
  end if;

  if v_relkind <> 'r' then
    raise exception 'VALIDATION FAILED [cleaner_pay_rates]: relkind is %, expected ordinary table (r)', v_relkind;
  end if;

  if v_owner <> 'postgres' then
    raise exception 'VALIDATION FAILED [cleaner_pay_rates]: owner is %, expected postgres', v_owner;
  end if;

  select array_agg(attname order by attname) into v_actual_cols
  from pg_attribute
  where attrelid = 'public.cleaner_pay_rates'::regclass and attnum > 0 and not attisdropped;

  select array_agg(x) into v_missing from unnest(v_expected_cols) x where x <> all(v_actual_cols);
  select array_agg(x) into v_extra from unnest(v_actual_cols) x where x <> all(v_expected_cols);

  if v_missing is not null then
    raise exception 'VALIDATION FAILED [cleaner_pay_rates]: missing expected column(s): %', v_missing;
  end if;

  if v_extra is not null then
    raise exception 'VALIDATION FAILED [cleaner_pay_rates]: unexpected extra column(s): %', v_extra;
  end if;

  for v_col in
    select a.attname, format_type(a.atttypid, a.atttypmod) as data_type, a.attnotnull,
           pg_get_expr(d.adbin, d.adrelid) as default_expr
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'public.cleaner_pay_rates'::regclass and a.attnum > 0 and not a.attisdropped
  loop
    case v_col.attname
      when 'cleaner_id' then
        if v_col.data_type <> 'uuid' then
          raise exception 'VALIDATION FAILED [cleaner_pay_rates.cleaner_id]: type is %, expected uuid', v_col.data_type;
        end if;
        if v_col.attnotnull is not true then
          raise exception 'VALIDATION FAILED [cleaner_pay_rates.cleaner_id]: must be NOT NULL';
        end if;
      when 'hourly_rate' then
        if v_col.data_type <> 'numeric' then
          raise exception 'VALIDATION FAILED [cleaner_pay_rates.hourly_rate]: type is %, expected numeric', v_col.data_type;
        end if;
        if v_col.attnotnull is not true then
          raise exception 'VALIDATION FAILED [cleaner_pay_rates.hourly_rate]: must be NOT NULL';
        end if;
        if v_col.default_expr is null or v_col.default_expr not in ('0', '0.0', '(0)::numeric') then
          raise exception 'VALIDATION FAILED [cleaner_pay_rates.hourly_rate]: default is %, expected 0', v_col.default_expr;
        end if;
      when 'updated_at' then
        if v_col.data_type <> 'timestamp with time zone' then
          raise exception 'VALIDATION FAILED [cleaner_pay_rates.updated_at]: type is %, expected timestamptz', v_col.data_type;
        end if;
        if v_col.attnotnull is not true then
          raise exception 'VALIDATION FAILED [cleaner_pay_rates.updated_at]: must be NOT NULL';
        end if;
        if v_col.default_expr is null or v_col.default_expr not ilike '%now()%' then
          raise exception 'VALIDATION FAILED [cleaner_pay_rates.updated_at]: default is %, expected now()', v_col.default_expr;
        end if;
    end case;
  end loop;

  select array_agg(a.attname order by a.attname) into v_pk_cols
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = 'public.cleaner_pay_rates'::regclass and i.indisprimary;

  if v_pk_cols is distinct from array['cleaner_id'] then
    raise exception 'VALIDATION FAILED [cleaner_pay_rates]: primary key columns are %, expected {cleaner_id}', v_pk_cols;
  end if;

  select count(*) into v_fk_count
  from pg_constraint con
  join pg_class target on target.oid = con.confrelid
  join pg_namespace tn on tn.oid = target.relnamespace
  where con.conrelid = 'public.cleaner_pay_rates'::regclass
    and con.contype = 'f'
    and tn.nspname = 'public'
    and target.relname = 'cleaners'
    and con.confdeltype = 'c';

  if v_fk_count <> 1 then
    raise exception 'VALIDATION FAILED [cleaner_pay_rates]: expected exactly one FK to public.cleaners with ON DELETE CASCADE, found %', v_fk_count;
  end if;

  select exists (
    select 1
    from pg_constraint con
    join pg_class target on target.oid = con.confrelid
    where con.conrelid = 'public.cleaner_pay_rates'::regclass
      and con.contype = 'f'
      and target.relname = 'cleaners'
      and con.confdeltype = 'c'
      and con.conkey = array[(select attnum from pg_attribute where attrelid = 'public.cleaner_pay_rates'::regclass and attname = 'cleaner_id')]
  ) into v_fk_col_ok;

  if not v_fk_col_ok then
    raise exception 'VALIDATION FAILED [cleaner_pay_rates]: foreign key source column is not cleaner_id';
  end if;

  if v_rls_enabled is not true then
    raise exception 'VALIDATION FAILED [cleaner_pay_rates]: row level security is not enabled';
  end if;

  if v_force_rls is true then
    raise exception 'VALIDATION FAILED [cleaner_pay_rates]: relforcerowsecurity is true, expected false';
  end if;

  raise notice 'VALIDATION PASSED [cleaner_pay_rates]: structure matches expected design';
end;
$val$;

-- ============================================================
-- 4. Policy and trigger convergence (only reached if both
--    validation blocks above succeeded without raising)
-- ============================================================

drop policy if exists "Admins full access - job_billing" on public.job_billing;
create policy "Admins full access - job_billing"
  on public.job_billing
  for all
  to public
  using (
    exists (
      select 1
      from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

drop trigger if exists trg_job_billing_updated_at on public.job_billing;
create trigger trg_job_billing_updated_at
  before update on public.job_billing
  for each row
  execute function public.set_updated_at();

drop policy if exists "Admins full access - cleaner_pay_rates" on public.cleaner_pay_rates;
create policy "Admins full access - cleaner_pay_rates"
  on public.cleaner_pay_rates
  for all
  to public
  using (
    exists (
      select 1
      from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role = 'admin'
    )
  );

drop trigger if exists trg_cleaner_pay_rates_updated_at on public.cleaner_pay_rates;
create trigger trg_cleaner_pay_rates_updated_at
  before update on public.cleaner_pay_rates
  for each row
  execute function public.set_updated_at();

commit;
