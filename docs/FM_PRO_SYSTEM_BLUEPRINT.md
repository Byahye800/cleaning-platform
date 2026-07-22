# ENGINEERING.md
## FM PRO Absolute Engineering, Design, Security, Verification and Deployment Standard

> **Authority:** Governing system-design and target-state directive. It defines what the complete FM PRO platform must become. The existing `ENGINEERING.md` remains the procedural authority for how every build cycle is executed.
>
> **Purpose:** Direct FM PRO from current state to one cohesive, secure, simple, efficient, practical, reliable, polished and live-verified production product.

---


# 0. Relationship to the Existing Project Foundation

This Blueprint does **not** replace, erase or invalidate the work already completed.

Everything already built by Claude or any other contributor remains the foundation of FM PRO unless a separate, evidence-based review proves that a specific part is defective, insecure, duplicated, obsolete or incompatible with the approved final product.

## Foundation Preservation Rule

- Existing verified functionality must remain intact.
- Existing working code must not be deleted merely because the Blueprint reorganises the final product vision.
- Existing migrations, routes, policies, pages, workflows, documentation and locked modules remain part of the project history and operating baseline.
- Restructuring means improving organisation, alignment, consistency, clarity and completion around the existing foundation.
- Refactoring or replacement requires a verified reason, explicit scope, impact analysis, rollback plan and approval.
- Nothing may be silently removed, renamed, superseded or rewritten.
- Historical evidence must remain preserved even when a newer structure becomes authoritative.

The governing default is:

> **Preserve first. Verify second. Extend carefully. Replace only when proven necessary and explicitly approved.**

## Document Authority and Division of Responsibility

The documents have different jobs and must not compete:

### `FM_PRO_SYSTEM_BLUEPRINT.md`

Defines:

- the complete target product;
- system identity;
- final architecture and navigation;
- role boundaries;
- design coherence;
- production-readiness destination;
- required end-state capabilities;
- system-wide quality expectations.

It answers:

> **What must the complete, polished and live-ready FM PRO platform become?**

### Existing `ENGINEERING.md`

Remains the controlling procedural authority for how build work is executed.

It governs:

- engineering phases;
- pre-flight;
- DESIGN approval;
- scope control;
- implementation discipline;
- testing;
- security verification;
- role testing;
- evidence;
- documentation;
- deployment;
- LOCK;
- drift prevention;
- assumption prevention.

It answers:

> **How must every approved change be safely designed, built, tested, verified, documented and locked?**

The Blueprint must not bypass, weaken or silently replace `ENGINEERING.md`.

When implementing any Blueprint requirement:

1. identify the gap between verified current state and target state;
2. open a properly scoped engineering cycle under `ENGINEERING.md`;
3. complete every required phase;
4. update evidence and documentation;
5. deploy and verify at the correct environment;
6. LOCK only after the existing engineering standard permits it.

If a Blueprint statement conflicts with an existing approved engineering control, stop and obtain explicit product-owner approval before changing either document or the system.

## Continuous Documentation Rule

Every meaningful project action must continue to be recorded through the existing documentation system.

At minimum:

- `SESSION-LOG.md` receives the chronological update;
- `ACTIVE-WORK.md` reflects only the current task and next approved action;
- `CURRENT-STATE.md` is updated when verified project state changes;
- `VERIFICATION-REGISTER.md` records the honest evidence tier;
- `KNOWN-ISSUES-REGISTER.md` records discovered defects, risks and resolutions;
- architecture or security decisions are updated when their governed areas change;
- completed work is preserved in session summaries and completion reports.

No work is considered properly closed if the system changed but the documentation trail did not.

## Existing Work Classification Before Any Restructure

Before changing an existing area, classify it as exactly one of:

1. **Verified and aligned — preserve unchanged**
2. **Working but structurally inconsistent — preserve behaviour, improve only through an approved cycle**
3. **Partial — complete around the existing foundation**
4. **Defective — repair the verified root cause**
5. **Security risk — contain and remediate through the required security cycle**
6. **Duplicated or obsolete — retain until replacement is verified, migrated and explicitly approved for retirement**
7. **Unable to verify — do not delete or rewrite; investigate first**

No existing area may be treated as disposable merely because the final Blueprint presents a clearer structure.

---

# 1. Absolute Product Identity

FM PRO is one role-based facilities-management system for **Admin, Cleaner and Client** users.

The finished platform must be:

- safe;
- secure;
- simple;
- efficient;
- functional;
- practical;
- reliable;
- cohesive;
- auditable;
- maintainable;
- recoverable;
- deployment-ready;
- productionally sound.

Every database object, route, page, component, workflow, permission, integration and visual pattern must contribute to one complete system. Do not build disconnected features.

The final product must feel designed and engineered together from the beginning.

---

# 2. Source-of-Truth Order

When records disagree, trust them in this order:

1. Live production application evidence.
2. Live production database evidence.
3. Exact deployed production commit and release manifest.
4. `origin/main`.
5. Live staging application evidence.
6. Live staging database evidence.
7. Approved architecture decisions.
8. Approved engineering designs.
9. Verification and known-issues registers.
10. Current-state and active-work records.
11. Session logs and summaries.
12. Memory, conversation history and assumptions.

Documentation can prove intent or history. Only live evidence proves current operation.

Never claim **fixed, complete, deployed, secure, working, production-ready, verified or LOCKED** without stating the environment and evidence tier.

---

# 3. Non-Negotiable Rules

## Preserve What Works

Do not change, remove, rename, refactor or relocate anything that:

- works;
- is secure;
- matches the approved architecture;
- is verified;
- and does not block the present objective.

A “cleaner” implementation is not permission to replace a stable one.

Every proposed change must state:

1. the verified problem;
2. the evidence;
3. the root cause;
4. why change is necessary;
5. the smallest safe correction;
6. affected surfaces;
7. regression risk;
8. rollback.

## No Assumption-Based Engineering

Never infer that a capability exists from a UI element, type, placeholder, comment, route name or design document.

Verify the real:

- repository code;
- route;
- component;
- API handler;
- server action;
- RPC;
- table and column;
- constraint and trigger;
- RLS policy;
- storage bucket and policy;
- integration;
- environment variable;
- deployment;
- live behaviour.

## No Silent Drift

Stop and report any drift from approved:

- scope;
- architecture;
- permissions;
- lifecycle;
- navigation;
- design language;
- security model;
- verification standard;
- release state.

## No Build-Now-Fix-Later

The governing sequence is:

**DESIGN → BUILD → COMPILE → FUNCTION TEST → VERIFY → SECURITY → ROLE TESTING → INTEGRATION → PERFORMANCE → EVIDENCE → DOCUMENTATION → DEPLOYMENT → PRODUCTION VERIFICATION → LOCK → NEXT MODULE**

Never stack unfinished features and plan to repair everything later.

## Fail Closed

For identity, permissions, lifecycle, finance, banking, storage and sensitive data:

- unknown = deny;
- missing = deny;
- inconsistent = deny;
- invalid = reject;
- stale = re-check;
- ambiguous = stop.

---

# 4. Mandatory Pre-Flight

Before every command, browser write, migration, code change or deployment, verify:

- repository path;
- branch;
- local HEAD;
- `origin/main` HEAD;
- merge/rebase/cherry-pick state;
- `git status -sb`;
- staged, unstaged and untracked files;
- target environment;
- command purpose;
- read-only or mutating impact;
- previous step passed;
- approval requirement;
- backup requirement;
- rollback availability;
- production scope.

Stop if:

- repository and documentation disagree;
- staging and production are not clearly distinguished;
- migration order is uncertain;
- secrets may be exposed;
- a LOCKED module is being edited without a new cycle;
- root cause is unverified;
- scope is exceeded;
- rollback is unavailable.

---

# 5. Production Engineering Confirmation Cycle

## 5.1 DESIGN

Produce and approve:

- verified current state;
- problem statement;
- root cause;
- requirements and non-requirements;
- affected files, routes, tables, functions, policies and roles;
- architecture;
- security and permission model;
- UI/UX model;
- data lifecycle;
- edge cases;
- rollback;
- test plan;
- deployment plan;
- definition of done.

No BUILD begins before approval.

## 5.2 BUILD

Requirements:

- minimum necessary change;
- clean architecture;
- consistent naming;
- no shortcuts;
- no duplicated authority;
- no client-trusted security decisions;
- no unrelated edits;
- no speculative refactoring;
- no secrets;
- no accidental generated files.

## 5.3 COMPILE

Required:

- TypeScript clean;
- lint clean or pre-existing exceptions proven;
- production build clean;
- no browser console errors;
- no unresolved imports;
- no schema/type mismatch;
- no missing-environment module-scope crash.

## 5.4 FUNCTION TEST

Test:

- pages;
- buttons;
- forms;
- modals and drawers;
- navigation;
- redirects;
- API routes;
- server actions;
- RPCs;
- database reads/writes;
- storage;
- notifications;
- integrations.

## 5.5 VERIFY

Test:

- expected output;
- invalid input;
- empty/loading/success/error states;
- duplicates;
- retries;
- idempotency;
- cancellation;
- concurrency;
- stale state;
- partial completion;
- missing data;
- dependency failure;
- recovery.

## 5.6 SECURITY

Verify:

- authentication;
- authorization;
- role and organisation derivation;
- lifecycle status;
- server-side re-verification;
- RLS;
- RPC ownership and grants;
- storage access;
- sensitive-data separation;
- validation;
- output minimisation;
- safe logging;
- direct API/database abuse;
- hostile-user cases.

## 5.7 ROLE TESTING

Test as:

- Admin;
- Cleaner;
- Client;
- Anonymous;
- Restricted;
- Suspended;
- Disabled;
- wrong-role authenticated user;
- stale/revoked session.

## 5.8 INTEGRATION AND REGRESSION

Confirm no breakage to:

- existing pages;
- workflows;
- database behaviour;
- permissions;
- finance/payroll;
- navigation;
- visual consistency;
- unrelated modules.

## 5.9 PERFORMANCE

Check:

- page speed;
- query count and plans where relevant;
- pagination;
- N+1 patterns;
- unnecessary renders;
- image delivery;
- storage performance;
- mobile behaviour.

## 5.10 EVIDENCE

Capture:

- exact commit;
- migration;
- environment;
- screenshots;
- browser/API/SQL results;
- role tests;
- failure tests;
- cleanup;
- regression;
- deployment;
- production verification.

## 5.11 DOCUMENT

Update the appropriate:

- architecture decision;
- current state;
- active work;
- verification register;
- known issues;
- session log;
- release manifest;
- recovery and rollback notes.

## 5.12 DEPLOY AND VERIFY

Deployment requires:

- approved commit;
- known migration order;
- environment confirmation;
- backup;
- rollback target;
- secret validation;
- controlled release;
- health check;
- production smoke test;
- production role verification.

## 5.13 LOCK

LOCK only when all relevant stages pass and deployment state is explicit.

Further changes require a new verified defect or requirement and a new DESIGN-to-LOCK cycle.

---

# 6. Evidence Tiers

Use these exact tiers:

1. Designed
2. Implemented
3. Statically verified
4. Database verified
5. Route/API verified
6. Browser verified
7. End-to-end verified
8. Staging verified
9. Production deployed
10. Production verified
11. LOCKED

Every report must state:

- what was tested;
- where;
- what was not tested;
- uncertainty;
- highest honest tier.

---

# 7. Release Manifest

Every production release must record:

```text
Release:
Date:
Approved commit:
Previous production commit:
Production host:
Production database:
Staging host:
Staging database:
Latest repository migration:
Latest staging migration:
Latest production migration:
Environment variables verified:
Backup completed:
Rollback commit:
Rollback database plan:
Staging verification:
Production smoke test:
Production role test:
Production E2E:
Known limitations:
Approved by:
```

Committed, merged, pushed, Vercel Ready or staging verified does not prove production deployment.

---

# 8. Environment Isolation

Staging and production require separate:

- Supabase projects;
- databases;
- storage;
- keys;
- SMTP;
- Stripe mode/secrets;
- deployment projects;
- URLs;
- cron secrets;
- integrations;
- test data;
- logs.

Never test staging work in production. Never copy production secrets into staging.

---

# 9. Security Architecture

Every sensitive action must be enforced by all applicable layers:

1. UI visibility;
2. route/session gate;
3. API/server authorization;
4. RPC authorization;
5. RLS;
6. storage policy;
7. audit log.

Hiding a button is not security.

Never trust client-supplied:

- user ID;
- role;
- organisation;
- account status;
- invitation/onboarding status;
- ownership;
- pay rate;
- approval;
- billing status;
- storage path;
- redirect target.

Re-derive authority server-side.

Sensitive data must remain separated and least-privileged:

- pay rates;
- payroll;
- banking;
- job billing;
- invoices;
- private evidence;
- internal notes;
- privileged audit events.

RLS rules:

- explicit RLS for user-facing tables;
- `security_invoker = true` for user-facing views;
- documented authorization in every `SECURITY DEFINER` function;
- no unnecessary client EXECUTE grants on trigger-only functions;
- explicit authorization before service-role operations;
- UI and database permissions must agree.

Never log passwords, tokens, sessions, PKCE values, invite secrets, recovery secrets, service-role credentials or full banking information.

---

# 10. Portal and Role Model

## Admin

Desktop-first, operationally dense, permission controlled.

Navigation:

1. Dashboard
2. Operations
   - Rota / Calendar
   - Jobs / Shifts
   - Attendance
   - Checklists
   - Completion Evidence
   - Service History
3. Issues & Maintenance
4. Workforce
5. Clients & Sites
6. Finance
7. Communications
8. Reports
9. Administration & Settings

Separate payroll and banking from ordinary profile editing.

## Cleaner

Mobile-first, minimal and action-led.

Bottom navigation:

1. Home
2. Shifts
3. Issues
4. History
5. Profile

Cleaner sees only own assigned work, own attendance, own evidence, own issues and permitted own details.

No access to another cleaner, company-wide payroll, other pay rates, client finance, private admin notes or unrestricted site records.

## Client

Client navigation:

1. Dashboard
2. Sites
3. Schedule
4. Service History
5. Issues
6. Invoices & Payments
7. Account

Client sees only its organisation, sites, services and billing.

No cleaner banking, pay rates, payroll, internal discussion, private notes, unapproved evidence or another client’s data.

---

# 11. Information and Interaction Architecture

Use:

- modal for short focused action;
- mobile bottom sheet for short mobile action;
- right drawer for contextual review;
- dedicated page for complex, historical, financial or sensitive workflow;
- tab for closely related entity views;
- confirmation dialog for destructive or privileged actions.

Do not create unnecessary pages.

Every page must define:

- purpose;
- role;
- primary CTA;
- secondary actions;
- data source;
- filters/search/sort;
- empty/loading/error states;
- permission rules;
- responsive behaviour;
- related modal/drawer;
- audit requirement.

Every button must define:

- permission;
- lifecycle condition;
- disabled condition;
- confirmation;
- result;
- success/error feedback.

Avoid duplicate CTAs, unexplained icon-only controls, destructive actions beside routine actions and admin controls in lower-privilege portals.

---

# 12. Visual Design Standard

The product must feel:

- professional;
- calm;
- premium;
- modern;
- trustworthy;
- uncluttered;
- operational.

Standardise:

- headers;
- breadcrumbs;
- spacing;
- cards;
- tables;
- filters;
- badges;
- tabs;
- forms;
- modals;
- drawers;
- save/cancel placement;
- loading/empty/error states;
- confirmations;
- mobile navigation;
- desktop sidebar;
- typography;
- contrast;
- focus states;
- responsive behaviour.

Accessibility requires keyboard support, visible focus, semantic labels, accessible dialogs, contrast, non-colour-only status meaning, screen-reader feedback and touch-safe controls.

---

# 13. Lifecycle-Aware Actions

Show actions only when valid.

Example:

| Shift state | Primary | Secondary | Hidden/disabled |
|---|---|---|---|
| Upcoming | View instructions | Report access concern | Check-out/completion |
| Ready to start | Check in | Checklist/report issue | Check-out before check-in |
| In progress | Continue checklist | Report issue/add evidence | Final completion before requirements |
| Ready to complete | Submit proof | Review checklist/photos | Duplicate submit |
| Completed | View history | Evidence/issue status | Edit approved evidence unless requested |

The UI, server and database must enforce the same lifecycle.

---

# 14. Account Lifecycle

Keep separate:

- access status;
- invitation status;
- onboarding status.

Do not overload one field.

Rules:

- invitation acceptance does not grant full access;
- profile completion does not activate;
- admin activation is the controlled transition;
- identity matching is server-side;
- wrong-account invitation use fails closed;
- transitions are idempotent where practical;
- real cleaner and client invitation-to-activation E2E tests are mandatory.

The manual UUID route, if retained, must be hidden emergency/dev-only, default disabled, admin-authorized, audited and explicitly enabled.

---

# 15. Photo and Evidence Architecture

Completion evidence and issue evidence are separate workflows sharing secure infrastructure.

## Completion evidence

Cleaner shift → complete checklist → capture/select → preview/remove/retake → submit → private storage → immutable metadata → admin notification → approve/reject/request replacement → cleaner result → service history.

## Issue evidence

Shift/Issues page → category/severity/title/description/photos → preview → submit → private storage → issue and attachment records → admin notification → conversation/follow-up → resolve/reopen/escalate → auditable history.

Required controls:

- private bucket;
- short-lived signed access;
- role/ownership checks;
- organisation-aware object paths;
- server timestamp;
- image hash;
- MIME validation and image decoding;
- file-size and image-count limits;
- immutable review history;
- no silent overwrite;
- no permanent public URLs;
- orphan cleanup;
- retention;
- safe client-visible derivatives.

EXIF GPS/device time is supporting evidence only. Trusted evidence is the private original, server time, linked account/shift/site, hash and review history.

---

# 16. Database and Migration Rules

Every migration must define:

- purpose;
- dependencies;
- compatibility;
- ownership/grants;
- RLS effects;
- trigger effects;
- fresh-bootstrap effects;
- staging verification;
- production order;
- rollback;
- verification queries.

Maintain one tested authoritative fresh-bootstrap procedure.

Never assume literal replay works. Test from an empty database. Confirm no partial state after failure.

---

# 17. API and RPC Rules

Every sensitive route must:

1. verify session;
2. verify role;
3. verify account status;
4. verify organisation/ownership;
5. validate input;
6. re-read authoritative state;
7. perform the narrowest operation;
8. return a curated response;
9. map raw errors safely;
10. log safely;
11. preserve auditability.

Avoid `select('*')` for sensitive contracts.

Every RPC must define caller, owner, grants, search path, authorization, concurrency, idempotency, exceptions and audit behaviour.

---

# 18. Required States and Tests

Every interactive feature must handle:

- loading;
- empty;
- success;
- validation failure;
- authorization failure;
- expired session;
- stale state;
- conflict;
- duplicate;
- network/database/storage/integration failure;
- partial completion;
- retry;
- cancel;
- recovery.

No blank screen, silent failure or false success.

Testing must include static, database, RLS, RPC, API, browser, role, hostile-user, integration, regression, performance, staging E2E, production smoke and production verification as relevant.

High-risk areas require stronger testing: auth, onboarding, service-role routes, RLS, finance, banking, storage, migrations, attendance correction, scheduling and destructive actions.

---

# 19. Documentation Discipline

`CURRENT-STATE.md` contains only current verified state.

`ACTIVE-WORK.md` contains only:

- current task;
- current cycle stage;
- next approved action;
- blockers;
- stop conditions.

Move historical “current task” material to session summaries.

Maintain:

- `ENGINEERING.md`;
- `CURRENT-STATE.md`;
- `ACTIVE-WORK.md`;
- architecture decisions;
- security model;
- verification register;
- known issues;
- recovery runbook;
- session log/summaries;
- release manifests;
- approved designs;
- completion reports.

Clearly label verified fact, assumption, inference, recommendation, risk, limitation, decision and approval.

---

# 20. Recovery

On resume:

1. read `ENGINEERING.md`;
2. read current state;
3. read active work;
4. inspect relevant ADR/security records;
5. fresh-clone `origin/main`;
6. verify HEAD/branch;
7. inspect latest session log;
8. inspect live environment if relevant;
9. classify recoverability;
10. report before mutation.

Classify work as:

- exists and verified;
- exact restoration possible;
- rebuild from approved requirements;
- not recoverable.

Never reconstruct security-sensitive code and claim it is the original.

---

# 21. Priority and Current Execution Order

Before major new product work:

1. reconcile repository, staging and production truth;
2. identify exact production host and deployed commit;
3. compare staging/production migrations with repository;
4. produce deployment-drift report;
5. back up production;
6. deploy the approved release if required;
7. run production smoke and role tests;
8. complete cleaner Stage 2.5 E2E;
9. complete client Stage 2.5 E2E;
10. resolve the manual-UUID decision;
11. reconcile documentation;
12. finish staging integrity checks;
13. resolve `STAGING-001`;
14. complete the approved Operations Attention Engine;
15. begin major Phase 6 work only after the foundation is certified.

Do not deepen deployment uncertainty with new major features.

---

# 22. Master Completion Checklist

- [ ] Designed
- [ ] Root cause verified
- [ ] Scope approved
- [ ] Architecture approved
- [ ] Security approved
- [ ] Roles defined
- [ ] Built
- [ ] TypeScript clean
- [ ] Lint clean
- [ ] Production build clean
- [ ] UI verified
- [ ] Database verified
- [ ] API/RPC verified
- [ ] RLS verified
- [ ] Storage verified
- [ ] Role permissions verified
- [ ] Anonymous access verified
- [ ] Errors verified
- [ ] Edge cases verified
- [ ] Mobile verified
- [ ] Accessibility verified
- [ ] Integration verified
- [ ] Regression verified
- [ ] Performance checked
- [ ] Evidence captured
- [ ] Documentation updated
- [ ] Staging deployed
- [ ] Staging E2E verified
- [ ] Production deployed
- [ ] Production smoke verified
- [ ] Production behaviour verified
- [ ] Rollback documented
- [ ] Release manifest completed
- [ ] LOCK approved
- [ ] Move to next module

---

# 23. Required Agent Reporting Format

Before implementation:

## VERIFIED CURRENT STATE
## PROBLEM
## ROOT CAUSE
## SCOPE
## SECURITY EFFECT
## DESIGN
## RISKS
## TEST PLAN
## ROLLBACK
## APPROVAL CHECKPOINT

After implementation:

## FILES CHANGED
## DATABASE CHANGED
## BEHAVIOUR CHANGED
## STATIC RESULTS
## FUNCTION RESULTS
## SECURITY RESULTS
## ROLE RESULTS
## INTEGRATION RESULTS
## PERFORMANCE RESULTS
## DEPLOYMENT RESULTS
## PRODUCTION RESULTS
## EVIDENCE TIER
## LIMITATIONS
## ROLLBACK POINT
## LOCK RECOMMENDATION

---

# 24. Golden Rule

> **Build → Test → Verify → Secure → Deploy → Production Verify → Lock → Move On**

Never:

> **Build → Build → Build → Fix everything later.**

---

# 25. Absolute Final Rule

The platform is not finished because code exists.

It is finished only when:

- architecture is aligned;
- permissions are enforced;
- database and storage are correct;
- UI is complete and cohesive;
- every role works;
- errors are handled;
- staging is proven;
- production matches the approved release;
- live behaviour is verified;
- rollback is possible;
- documentation matches reality;
- and the product operates as one polished system.

> **No ambiguity. No silent drift. No unsupported claims. No unverified production state. No unnecessary change. No shortcuts.**
