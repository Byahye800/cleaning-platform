# ENGINEERING-PROTOCOL.md

**Status: governing document. Effective 2026-07-20, permanent until the user explicitly amends it.**

This document is the single authoritative source for how engineering work on this project is planned, implemented, verified, approved, and closed. It was issued directly by the project owner as a permanent operating protocol. If any other document, task list, or session's working assumptions conflict with this file, **this file takes precedence** unless the user explicitly approves an exception in that session.

Every operational source-of-truth document in this repository (`CLAUDE.md`, `docs/NEXT-SESSION-HANDOVER.md`, `docs/PROJECT-STATUS.md`, `docs/SESSION-LOG.md`, `docs/memory/*`, `docs/STAGING-*`, `docs/KNOWN-ISSUES-REGISTER.md`) references this file rather than duplicating it. There is only one copy of this protocol, here.

**Any future engineer, contributor, or Claude session must read this file before beginning any work on this project.**

---

## 1. Scope of this protocol

This instruction changes **only how remaining work is managed and verified.** It does not authorise any change to:

- the approved product design
- the system architecture
- the technology stack
- the database structure
- the role model (Admin / Cleaner / Client)
- portal responsibilities
- security boundaries
- existing scope

The current project and its architecture must be preserved exactly unless the user separately and explicitly approves an architectural change.

## 2. Sequencing rule — one controlled objective at a time

The project progresses through **one controlled objective at a time.**

- Work must follow the existing priority order, starting with the most important unresolved approved item.
- Do not invent additional phases, checkpoints, workstreams, redesigns, or side objectives.
- Do not move to lower-priority work while a higher-priority approved issue remains unresolved, unless it is genuinely blocked and the blocker has been clearly evidenced.
- Do not bundle multiple unresolved objectives into one implementation.

## 3. Establish verified state before proposing solutions

For each objective, before proposing any solution:

- Establish the exact current state from the repository, the deployed environment, and the source-of-truth documentation.
- Separate verified facts from assumptions.
- Understand the affected workflow, dependencies, permissions, data paths, security boundaries, and possible effects on existing functionality.

## 4. Mandatory acceptance conditions

Every decision and implementation must preserve all five of the following. These are mandatory acceptance conditions, not optional preferences:

- **Safety**
- **Security**
- **Functionality**
- **Practicality**
- **Reliability**

A quick fix must never be chosen where it creates uncertainty, weakens security, damages maintainability, introduces unnecessary complexity, or risks another part of the system.

## 5. The engineering cycle

Use this controlled cycle for every approved objective:

1. **DESIGN** — Confirm the requirement, expected result, affected architecture, permissions, dependencies, risks, and acceptance criteria. Do not change the approved design or expand scope.
2. **BUILD** — Implement only the smallest complete change required to achieve the approved objective. Follow the existing architecture, naming patterns, and established project conventions. No shortcuts, temporary bypasses, or unrelated improvements.
3. **COMPILE** — Confirm the application builds successfully and there are no relevant TypeScript, lint, runtime, or console errors.
4. **FUNCTION TEST** — Test the complete intended workflow: pages, buttons, forms, modals, navigation, APIs, database actions, and visible results.
5. **VERIFY** — Test the expected path and all meaningful failure conditions: invalid input, empty states, loading states, success states, errors, interrupted workflows, relevant edge cases.
6. **SECURITY** — Verify authentication, authorization, role boundaries, RLS, permissions, sensitive-data exposure, input validation, and any trust boundary affected by the change.
7. **ROLE TESTING** — Verify the result independently for Admin, Cleaner, Client, and anonymous access wherever relevant. Each role must see and perform only what the approved architecture allows.
8. **INTEGRATION** — Confirm the work has not damaged existing pages, workflows, data, APIs, database behaviour, other modules, or previously completed functionality.
9. **PERFORMANCE AND PRACTICALITY** — Confirm the solution performs reasonably, avoids unnecessary queries or rendering, handles images/data appropriately, and remains understandable and supportable in real operation.
10. **EVIDENCE** — Record sufficient evidence to prove what was tested and what passed: screenshots, command output, test results, database results, browser behaviour, concise verification notes. A commit alone is not proof of completion.
11. **LOCK** — An objective may be marked complete only when every applicable acceptance condition has passed with evidence and there are no unresolved defects, unexplained behaviours, unverified assumptions, or hidden follow-up tasks connected to it. Once complete, update the relevant source-of-truth records and lock the objective. Do not reopen or alter it unless a genuine defect or separately approved requirement is discovered.
12. **MOVE FORWARD** — Only after the current objective has been fully completed, verified, documented, and locked may the next approved priority begin.

**Governing rule:**

> Understand → Design → Build → Test → Verify → Secure → Evidence → Lock → Move on.

**Never:**

> Build → Build → Build → create more phases → postpone verification → repair everything later.

## 6. Closure discipline

- Do not mark something complete merely because the main happy path works.
- Before closure, actively examine anything that could reasonably create a safety, security, functional, practical, or reliability problem.
- Any issue discovered must be understood and resolved within the approved scope, or formally recorded as an explicit blocker requiring the user's decision. It must not be silently deferred, hidden inside documentation, or converted into an invented future phase.
- Never use a workaround as proof that the underlying defect has been resolved.

## 7. Boundaries requiring explicit approval

Do not make production, migration, infrastructure, database, or architectural changes without the approval boundaries already established for this project.

When an approval boundary is reached: **stop.** Present the evidence and the safest recommended decision without making the restricted change.

## 8. Checkpoint reporting format

At every checkpoint, report the outcome using the existing project records rather than creating unnecessary new documents or tracking systems. State:

1. The single objective being handled.
2. Why it is currently the highest approved priority.
3. What was verified before work began.
4. The precise scope and acceptance criteria.
5. The implementation performed.
6. The tests and security checks completed.
7. The evidence obtained.
8. Anything still unresolved.
9. Whether the objective is genuinely ready to be locked.

## 9. Precedence

This protocol governs all remaining engineering work on this project so that it advances systematically, stays aligned with its approved architecture, and reaches production without drift, avoidable gaps, or falsely completed work.

If a future task conflicts with this protocol, **the protocol takes precedence unless the user explicitly approves an exception.**

---

*Issued by the project owner, 2026-07-20. This file is referenced, not duplicated, by every other operational document in this repository.*
