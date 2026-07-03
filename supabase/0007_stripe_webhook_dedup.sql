-- Stripe delivers webhooks at-least-once: the same event can arrive more than
-- once (retries after timeouts, manual resends from the Dashboard, etc). This
-- table lets the webhook route atomically claim an event id before acting on
-- it, so a duplicate delivery can't double-fire side effects.
create table if not exists stripe_webhook_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

-- Only the webhook route's service-role client touches this table (Stripe calls
-- it server-to-server with no user session). Service role bypasses RLS regardless,
-- but enabling RLS with zero policies means anon/authenticated roles get zero
-- access to it by default, consistent with every other table in this app.
alter table stripe_webhook_events enable row level security;
