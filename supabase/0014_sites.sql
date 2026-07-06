-- Adds public.sites (a client can have more than one physical location) and
-- jobs.site_id linking a job to one. Backfills exactly one site per existing
-- client (named/addressed after that client), then points every existing job
-- with a null site_id at its own client's backfilled site, so no job is left
-- unlinked. Going forward, nothing stops a client having multiple sites --
-- the one-site-per-client backfill is a migration convenience, not a
-- constraint (deliberately no unique index on sites.client_id).
--
-- RLS: mirrors 0005_schema_catchup.sql's three-role pattern for clients/jobs
-- exactly -- admin full access, client reads own rows, and (copying
-- jobs_select_for_own_cleaner's exact join logic, extended one hop through
-- jobs.site_id) a cleaner reads a site if one of their own assigned jobs
-- points to it. sites had no policies at all in the pasted draft, which
-- would have made it the one table in this schema without row-level access
-- control. Not wiring up any app code in this pass; this is schema only.

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  name text not null,
  address text not null,
  access_notes text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists sites_client_id_idx on public.sites(client_id);

alter table public.jobs
  add column if not exists site_id uuid references public.sites(id);

create index if not exists jobs_site_id_idx on public.jobs(site_id);

insert into public.sites (client_id, name, address, status)
select id, name, address, 'active' from public.clients
where not exists (select 1 from public.sites where sites.client_id = clients.id);

update public.jobs
set site_id = (select id from public.sites where sites.client_id = jobs.client_id limit 1)
where site_id is null;

alter table public.sites enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sites' and policyname = 'Admins full access - sites'
  ) then
    create policy "Admins full access - sites" on public.sites
      for all
      to public
      using (
        exists (
          select 1 from public.user_roles
          where user_roles.user_id = auth.uid() and user_roles.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sites' and policyname = 'Clients read own sites'
  ) then
    create policy "Clients read own sites" on public.sites
      for select
      to public
      using (
        client_id in (
          select clients.id from public.clients where clients.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sites' and policyname = 'Cleaners read sites of their own jobs'
  ) then
    create policy "Cleaners read sites of their own jobs" on public.sites
      for select
      to authenticated
      using (
        exists (
          select 1 from public.jobs j
          join public.cleaners c on c.id = j.cleaner_id
          join public.user_roles ur on ur.user_id = c.user_id
          where j.site_id = sites.id and ur.user_id = auth.uid() and ur.role = 'cleaner'
        )
      );
  end if;
end $$;
