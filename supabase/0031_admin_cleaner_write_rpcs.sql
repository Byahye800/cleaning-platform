-- Migration 0031: Admin cleaner write RPCs (ADMIN-CLEANERS-001)
--
-- Restores the ability for admins to create and edit cleaner records through
-- SECURITY-INVOKER RPCs that are called exclusively from server-side Next.js
-- Route Handlers (src/app/api/admin/cleaners/route.ts and
-- src/app/api/admin/cleaners/[id]/route.ts). The browser client never calls
-- these functions directly and never performs direct insert/update against
-- public.cleaners or public.cleaner_pay_rates.
--
-- Both functions:
--   - Re-check auth.uid() and admin role internally (defense in depth beyond
--     RLS), raising 'not authenticated' / 'not authorized: admin role
--     required' on failure.
--   - Validate required fields and constraints (non-blank name/email,
--     hourly_rate > 0, dbs_status enum) before touching the database.
--   - Write an activity_log row (cleaner.created / cleaner.updated) as part
--     of the same transaction.
--   - Return a jsonb snapshot of the resulting cleaner row (including the
--     current hourly_rate from cleaner_pay_rates).
--
-- This file documents the exact function definitions as verified live on
-- staging (project jwdfzgibrijcyypibhjw) via pg_get_functiondef, after the
-- ADMIN-CLEANERS-001 remediation passed its full E2E verification cycle.
--
-- Numbered 0031 (not 0030) because 0030_invitation_finalization_eligibility.sql
-- already occupies that slot in this repository.

create or replace function public.admin_create_cleaner(
  p_name text,
  p_email text,
  p_hourly_rate numeric,
  p_user_id uuid default null::uuid,
  p_phone text default null::text,
  p_dbs_status text default null::text,
  p_dbs_check_date date default null::date,
  p_emergency_contact text default null::text,
  p_skills text[] default null::text[],
  p_notes text default null::text
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_phone text;
  v_dbs_status text;
  v_emergency_contact text;
  v_notes text;
  v_skills text[];
  v_row public.cleaners%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.user_roles
    where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
  ) then
    raise exception 'not authorized: admin role required';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'name must not be null or blank';
  end if;

  if p_email is null or btrim(p_email) = '' then
    raise exception 'email must not be null or blank';
  end if;

  if p_hourly_rate is null then
    raise exception 'hourly_rate must not be null';
  end if;

  if p_hourly_rate <= 0 then
    raise exception 'hourly_rate must be greater than 0';
  end if;

  if p_dbs_status is not null
    and btrim(p_dbs_status) <> ''
    and p_dbs_status not in ('pending','clear','flagged','expired') then
    raise exception
      'dbs_status must be one of pending, clear, flagged, expired, or null';
  end if;

  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  v_dbs_status := nullif(btrim(coalesce(p_dbs_status, '')), '');
  v_emergency_contact := nullif(btrim(coalesce(p_emergency_contact, '')), '');
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  v_skills := p_skills;
  if v_skills is not null and array_length(v_skills, 1) is null then
    v_skills := null;
  end if;

  begin
    insert into public.cleaners (
      user_id, name, email, phone, dbs_status, dbs_check_date,
      emergency_contact, skills, notes, status
    ) values (
      p_user_id, p_name, p_email, v_phone, v_dbs_status, p_dbs_check_date,
      v_emergency_contact, v_skills, v_notes,
      'restricted'
    )
    returning * into v_row;
  exception
    when unique_violation then
      raise exception
        'email or user_id already in use by another cleaner';
  end;

  insert into public.cleaner_pay_rates (cleaner_id, hourly_rate)
  values (v_row.id, p_hourly_rate);

  begin
    insert into public.activity_log (actor_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'cleaner.created', 'cleaner', v_row.id,
      jsonb_build_object('changed_fields', array['name','email','hourly_rate']));
  exception when others then
    raise;
  end;

  select jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'email', v_row.email,
    'phone', v_row.phone,
    'dbs_status', v_row.dbs_status,
    'dbs_check_date', v_row.dbs_check_date,
    'emergency_contact', v_row.emergency_contact,
    'skills', v_row.skills,
    'notes', v_row.notes,
    'status', v_row.status,
    'hourly_rate', p_hourly_rate
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.admin_update_cleaner(
  p_cleaner_id uuid,
  p_fields text[],
  p_name text default null::text,
  p_email text default null::text,
  p_phone text default null::text,
  p_dbs_status text default null::text,
  p_dbs_check_date date default null::date,
  p_emergency_contact text default null::text,
  p_skills text[] default null::text[],
  p_notes text default null::text,
  p_hourly_rate numeric default null::numeric
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_allowed_fields text[] := array['name','email','phone','dbs_status',
    'dbs_check_date','emergency_contact','skills','notes','hourly_rate'];
  v_clean_fields text[];
  v_field text;
  v_phone text;
  v_dbs_status text;
  v_emergency_contact text;
  v_notes text;
  v_skills text[];
  v_row public.cleaners%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.user_roles
    where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
  ) then
    raise exception 'not authorized: admin role required';
  end if;

  if p_fields is null or array_length(p_fields, 1) is null then
    raise exception 'no editable fields supplied';
  end if;

  if exists (select 1 from unnest(p_fields) f where f is null) then
    raise exception 'p_fields must not contain null entries';
  end if;

  select array_agg(distinct f order by f) into v_clean_fields
  from unnest(p_fields) f;

  foreach v_field in array v_clean_fields loop
    if not (v_field = any(v_allowed_fields)) then
      raise exception 'unknown or protected field: %', v_field;
    end if;
  end loop;

  select * into v_row from public.cleaners where id = p_cleaner_id for update;
  if not found then
    raise exception 'cleaner not found: %', p_cleaner_id;
  end if;

  if 'name' = any(v_clean_fields) then
    if p_name is null or btrim(p_name) = '' then
      raise exception 'name must not be null or blank';
    end if;
  end if;

  if 'email' = any(v_clean_fields) then
    if p_email is null or btrim(p_email) = '' then
      raise exception 'email must not be null or blank';
    end if;
  end if;

  if 'phone' = any(v_clean_fields) then
    v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  end if;

  if 'dbs_status' = any(v_clean_fields) then
    v_dbs_status := nullif(btrim(coalesce(p_dbs_status, '')), '');
    if v_dbs_status is not null
      and v_dbs_status not in ('pending','clear','flagged','expired') then
      raise exception
        'dbs_status must be one of pending, clear, flagged, expired, or null';
    end if;
  end if;

  if 'emergency_contact' = any(v_clean_fields) then
    v_emergency_contact := nullif(btrim(coalesce(p_emergency_contact, '')), '');
  end if;

  if 'notes' = any(v_clean_fields) then
    v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  end if;

  if 'skills' = any(v_clean_fields) then
    v_skills := p_skills;
    if v_skills is not null and array_length(v_skills, 1) is null then
      v_skills := null;
    end if;
  end if;

  if 'hourly_rate' = any(v_clean_fields) then
    if p_hourly_rate is null then
      raise exception 'hourly_rate must not be null when supplied';
    end if;
    if p_hourly_rate <= 0 then
      raise exception 'hourly_rate must be greater than 0';
    end if;
  end if;

  begin
    update public.cleaners set
      name = case when 'name' = any(v_clean_fields) then p_name else name end,
      email = case when 'email' = any(v_clean_fields) then p_email else email end,
      phone = case when 'phone' = any(v_clean_fields) then v_phone else phone end,
      dbs_status = case when 'dbs_status' = any(v_clean_fields)
        then v_dbs_status else dbs_status end,
      dbs_check_date = case when 'dbs_check_date' = any(v_clean_fields)
        then p_dbs_check_date else dbs_check_date end,
      emergency_contact = case when 'emergency_contact' = any(v_clean_fields)
        then v_emergency_contact else emergency_contact end,
      skills = case when 'skills' = any(v_clean_fields) then v_skills else skills end,
      notes = case when 'notes' = any(v_clean_fields) then v_notes else notes end
    where id = p_cleaner_id
    returning * into v_row;
  exception when unique_violation then
    raise exception 'email already in use by another cleaner';
  end;

  if not found then
    raise exception 'cleaner update affected zero rows: %', p_cleaner_id;
  end if;

  if 'hourly_rate' = any(v_clean_fields) then
    insert into public.cleaner_pay_rates (cleaner_id, hourly_rate)
    values (p_cleaner_id, p_hourly_rate)
    on conflict (cleaner_id) do update
      set hourly_rate = excluded.hourly_rate;
  end if;

  begin
    insert into public.activity_log (actor_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'cleaner.updated', 'cleaner', p_cleaner_id,
      jsonb_build_object('changed_fields', v_clean_fields));
  exception when others then
    raise;
  end;

  select jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'email', v_row.email,
    'phone', v_row.phone,
    'dbs_status', v_row.dbs_status,
    'dbs_check_date', v_row.dbs_check_date,
    'emergency_contact', v_row.emergency_contact,
    'skills', v_row.skills,
    'notes', v_row.notes,
    'status', v_row.status,
    'hourly_rate', (
      select cpr.hourly_rate from public.cleaner_pay_rates cpr
      where cpr.cleaner_id = p_cleaner_id
    )
  ) into v_result;

  return v_result;
end;
$function$;

-- Grants: authenticated only (RPCs perform their own admin-role check
-- internally; anon has no access). service_role/postgres retain implicit
-- owner/superuser access and are not granted explicitly here.
grant execute on function public.admin_create_cleaner(
  text, text, numeric, uuid, text, text, date, text, text[], text
) to authenticated;

grant execute on function public.admin_update_cleaner(
  uuid, text[], text, text, text, text, date, text, text[], text, numeric
) to authenticated;
