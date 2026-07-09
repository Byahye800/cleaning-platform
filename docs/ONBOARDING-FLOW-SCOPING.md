# Scoping Doc — Employee/Client Onboarding & Account Lifecycle

Review and design only. No code changes applied. This is the gap the audit flagged as "the single biggest structural gap blocking real growth beyond one cleaner/client" — today, adding anyone new requires an admin to manually create a Supabase Auth user outside the app, then paste that user's UUID into a plain text field.

## Current state (confirmed live, not assumed)

| Tick item | Status |
|---|---|
| #8 Invitation/onboarding flow | Not Implemented — zero signup/invite code anywhere |
| #9 Password recovery | Complete, already works |
| #10 Expired links | Unknown/unverified — governed by Supabase Auth's own settings, no custom handling either way |
| #11 Resend invite | Not Implemented (nothing to resend, depends on #8) |
| #12 Change email | Not Implemented — the only `auth.updateUser()` call anywhere is for password |
| #13 First login flow | Not Implemented — a new account lands on its portal home exactly like a returning one |
| #14 Account deactivation | Field + admin UI exist; enforcement was the gap Fix 2 already closed this session |

Also confirmed live: `cleaners` already has `phone`, `emergency_contact`, `notes`, `skills`, `dbs_status`, `dbs_check_date`, `name`, `email`, `status`. `clients` already has `name`, `contact_email`(-style field)/`contact_phone`, `agreed_rate`, `notes`, `status`. No new columns are needed on either table for the first-login profile-confirmation step below — it's filling in fields that already exist, not adding new ones.

## Confirmed decisions

1. **Pending → active:** three-state flow, not two. Invited user starts `pending`, becomes `pending_profile_complete` once they've set a password and confirmed their profile details, and only becomes `active` once an admin explicitly approves them. Applies to both roles — cleaners because of DBS/right-to-work checks, clients because access should still be admin-controlled even though the operational risk is lower.
2. **Email change:** self-service only for now (`auth.updateUser({ email })`, requires the user's own confirmation click). No admin-override path yet — add later only if a real recovery case demands it, per the account-takeover risk noted below.
3. **First-login experience:** a real profile-confirmation step, not just password-set. Cleaner confirms phone + emergency contact + basic details (existing columns, listed above). Client confirms company/site contact details (ties into the `sites` contact fields already scoped in the Phase 6 doc).
4. **Where this lives:** folded into the existing `/admin/cleaners` and `/admin/clients` create forms as the primary path, but organized under its own dedicated page — **Application Forms** — as the one place admin goes to add anyone. The current manual-UUID entry field is not deleted outright; it moves behind an emergency/dev-only mode (not visible in normal admin use) rather than being a first-class option.

## The core fix: Supabase Auth's built-in invite mechanism

`auth.admin.inviteUserByEmail()` creates the `auth.users` row immediately, returns its real UUID, and emails the invitee a link to set their own password — using Supabase's own email sending, no third-party service required for this part. This is what "Application Forms" calls under the hood, replacing the manual create-then-paste-UUID step entirely.

Must run server-side only (service-role key) — a new API route, e.g. `/api/admin/invite-user`, following the exact discipline just applied to `send-invoice`: an explicit backend admin-role check before anything else, since this route creates real login-capable accounts and sends real emails. Not something RLS alone should be trusted to gate, given it uses the service-role key and bypasses RLS entirely.

### Proposed flow, incorporating the three-state status

1. Admin fills the Application Forms page (name, email, role, and — for cleaners — DBS status/date, etc., same fields already collected today).
2. `/api/admin/invite-user` calls `inviteUserByEmail`, gets back a real `user_id`, creates the `cleaners`/`clients` row with `status = 'pending'` and the matching `user_roles` row.
3. Invitee clicks the email link, sets a password, lands on the first-login profile-confirmation screen (Section below). Completing it flips `status` to `pending_profile_complete`.
4. Admin sees `pending_profile_complete` accounts in a review queue (most naturally a section of the same Application Forms page), checks whatever needs checking (DBS confirmed, etc.), and explicitly flips `status` to `active`. Only `active` accounts can log in past Fix 2's status check — `pending` and `pending_profile_complete` are both correctly blocked by the same "anything other than active is denied" logic already live.

### Resend invite (#11)

`auth.admin.generateLink({ type: 'invite', email })` re-issues a fresh link for an account still in `pending`. A "Resend invite" action on the Application Forms page's pending list.

### Expired links (#10)

Governed by a Supabase Auth project setting (link expiry duration) — worth setting a deliberate value rather than the default, and showing a clear "this invite has expired, ask your admin to resend it" state rather than a raw error.

### Change email (#12) — confirmed: self-service only

`auth.updateUser({ email })`, Supabase sends a confirmation link before it takes effect — nobody's login email changes without their own confirmation. No admin-override path for now. If you hit a real recovery case later (someone genuinely locked out of both accounts), that's a deliberately separate, explicitly-logged admin action to scope then — not bundled in now, precisely because `updateUserById` run carelessly is a real account-takeover primitive if the admin-role check on that route were ever weak.

### First-login flow (#13) — confirmed: profile-confirmation screen

After password-set, before landing on the normal portal home:

- **Cleaner:** confirm/edit `phone`, `emergency_contact`, and the other basic fields already on `cleaners` — the account isn't just log-in-capable at this point, it's operationally usable (admin can actually reach them if something goes wrong on a job).
- **Client:** confirm/edit company details and site contact info — the latter maps onto the `sites.contact_name`/`contact_phone`/`contact_email` fields scoped in the Phase 6 doc, so this step and that schema work should land together rather than the client screen asking for fields that don't exist in the database yet.

Completing this step is what flips `pending` → `pending_profile_complete`, per decision #1 above.

## Security notes specific to this feature

- Every route here (invite, resend, change-email if ever added) uses the service-role key — every one needs the explicit backend admin-role check pattern, not RLS alone, matching exactly what Item 3 spent this session hunting for and closing elsewhere.
- An unguarded invite endpoint is an email-spam vector — another reason the admin-role check has to be real and tested, not assumed.
- The three-state status (`pending` / `pending_profile_complete` / `active`) needs no schema change — `status` is already unconstrained text — and Fix 2's `proxy.ts` check already treats anything other than `'active'` as blocked, so both intermediate states are correctly locked out with zero additional middleware work.
- The manual-UUID fallback, once demoted to emergency/dev-only, should still go through the same admin-role check as everything else here — "emergency mode" isn't a reason to skip authorization, just a reason the normal UI doesn't surface it.

## What this doc is not

Not a migration, not a file-by-file build plan. The core mechanism (Supabase's built-in invite) fits this app's scale and avoids a new third-party email dependency for this part specifically (separate from the Phase 6 doc's SMS/email notification needs, which do require Resend/Twilio).

## Open questions remaining

1. Should `pending_profile_complete` → `active` review be its own dedicated section of the Application Forms page, or folded into the existing `/admin/cleaners` and `/admin/clients` list views (e.g. a status filter/badge)?
2. For clients specifically — given the audit noted client access is lower operational risk than cleaner access — do you want the same mandatory admin-approval gate, or would you accept an auto-active path for clients only, keeping manual approval strictly for cleaners (where DBS/right-to-work matters)? Your answer above said admin approval applies to both, flagging this only because it's worth being certain that's deliberate rather than a default.
