-- Supabase auto-grants EXECUTE on new public-schema functions to anon,
-- authenticated, and service_role by default -- separate from the PUBLIC
-- role, so 0008's `revoke all ... from public` did not strip anon's grant.
-- Not exploitable today (anon has no auth.uid(), so the function's own
-- authorization check always fails for it), but it's an unnecessary grant
-- on a function that touches the jobs table. REVOKE is naturally idempotent
-- (no error if already revoked), consistent with the other migrations.
revoke execute on function public.cleaner_update_job_status(uuid, text) from anon;
