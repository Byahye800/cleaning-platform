-- Admin role bootstrap helper
-- Run after 0001_init_phase1.sql

-- Replace <ADMIN_AUTH_UUID> and <ADMIN_EMAIL> checks as needed.
-- Option 1: directly insert by UUID.
-- insert into public.user_roles(user_id, role, is_active)
-- values ('<ADMIN_AUTH_UUID>', 'admin', true)
-- on conflict (user_id) do update set role=excluded.role, is_active=excluded.is_active;

-- Option 2: find UUID by email and insert.
-- Do this in the SQL console with a known admin email.
--
-- with admin as (
--   select id as user_id from auth.users where email = '<ADMIN_EMAIL>' limit 1
-- )
-- insert into public.user_roles(user_id, role, is_active)
-- select user_id, 'admin', true from admin
-- on conflict (user_id) do update set role=excluded.role, is_active=excluded.is_active;
