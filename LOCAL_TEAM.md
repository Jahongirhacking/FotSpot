# FotSpot — Local Team (Unverified Academy) Feature

## 1. Architecture Decision

Add a new concept called **Local Team**.

The recommended architecture is:

> **Do NOT create a separate `Team` model. Reuse the existing `Academy` model and distinguish verified academies from local teams using an explicit status/type.**

For example:

```text
Academy
  status:
    VERIFIED   → Verified Academy
    UNVERIFIED → Local Team
```

The exact field/enum name should follow the existing project's conventions.

### Critical requirement

The existing **Verified Academy** workflow must remain exactly as it currently works.

The Local Team feature must be isolated so that it causes **zero regressions or behavioral changes** to verified academies.

---

# 2. Core Concept

A Local Team is structurally similar to an Academy:

- It has a manager.
- It has a squad.
- It can accept players.
- It can accept scouts.
- It can have player recommendations.
- It has dashboard/feed/inbox/squad/player functionality.

However, its workflow is intentionally much simpler.

## Verified Academy

```text
Player
  ↓
Recommendation
  ↓
Online Coach Review
  ↓
Private Trial / Global Trial
  ↓
Coach Pass / Fail
  ↓
Squad
```

## Local Team

```text
Player
  ↓
Local Team Manager
  ↓
Invite / Accept Player
  ↓
Squad
```

There is **no Coach, Online Coach Review, or Trial** for Local Teams.

---

# 3. Verified Academy Must Not Change

This is the most important requirement.

Existing verified Academy functionality must remain unchanged:

- Coach exists.
- Academy Manager can create/manage Coaches.
- Coach transfer works.
- Online Coach Review works.
- Trials work.
- Coach can Pass/Fail a trial.
- Existing recommendation lifecycle works.
- Recommendation cleanup works where currently implemented.
- Scout success-rate recalculation works where currently implemented.
- Existing Academy lists and discovery behavior remain unchanged.

Do not rewrite or heavily refactor the existing verified Academy workflow unless absolutely necessary.

Prefer adding an isolated `UNVERIFIED` branch around the existing logic.

Conceptually:

```text
if academy.status === VERIFIED:
    existing Academy behavior

if academy.status === UNVERIFIED:
    Local Team behavior
```

Reuse shared functionality where appropriate, but keep business workflows explicitly separated.

---

# 4. Local Team Terminology

Internal/backend terminology can use:

```text
UNVERIFIED
```

or the project's equivalent enum value.

User-facing terminology should be:

```text
Local Team
```

For the Uzbek product UI:

```text
Mahalliy Jamoa
```

Do not expose technical `UNVERIFIED` terminology to normal users unless necessary.

---

# 5. Local Team Manager

A Local Team Manager should have the same general manager concept as an Academy Manager, but with restricted capabilities.

## Navbar

The Local Team Manager navbar must contain:

```text
Dashboard
Feed
Inbox
Squad
Players
```

There must be **no Trials menu**.

There must be no Coach-management menu.

## Local Team Manager can:

- View players.
- Search/discover players according to existing player access rules.
- Invite a player.
- Accept a player into the squad.
- Manage squad players according to existing squad rules.
- Accept/add scouts to the Local Team.
- View recommendations associated with players.
- Perform normal squad-management operations.

## Local Team Manager cannot:

- Create a Coach.
- Transfer a Coach.
- Manage Coaches.
- Create Online Coach Reviews.
- Send players to Online Coach Review.
- Create Trials.
- Manage Trials.
- Accept/reject Coach Review.
- Perform Pass/Fail trial operations.

---

# 6. Local Teams Have No Coaches

A Local Team must not have Coaches.

Therefore:

```text
Local Team
    └── Manager
```

not:

```text
Local Team
    ├── Manager
    └── Coach
```

The following actions must be unavailable:

```text
Create Coach
Transfer Coach
Assign Coach
Remove Coach
Coach Review
```

This restriction must be enforced on both:

1. Frontend/UI
2. Backend authorization/business logic

Hiding buttons in the frontend is not sufficient.

---

# 7. No Online Coach Review

Local Teams do not use the Coach review pipeline.

For a Local Team:

```text
Player
  ↓
Manager
  ↓
Squad
```

There must be no:

```text
Player
  ↓
Online Coach Review
  ↓
Accept / Reject
```

Any backend endpoint that creates or manages Online Coach Reviews must reject requests involving an `UNVERIFIED` Academy/Local Team.

Use the project's existing authorization/error conventions.

---

# 8. No Trials

Local Teams do not have trials.

This means:

- No Global Trials.
- No Private Trials.
- No Trial creation.
- No Trial application.
- No Trial acceptance.
- No Trial rejection.
- No Coach Pass/Fail.
- No Trial-related recommendation cleanup.

The existing Verified Academy trial system must remain unchanged.

---

# 9. Player Acceptance Flow

The main player workflow for Local Teams is:

```text
Local Team Manager
        ↓
Find / Select Player
        ↓
Invite Player
        ↓
Player accepts / existing invitation flow
        ↓
Player joins Local Team squad
```

Follow the existing project's invitation/squad conventions rather than creating unnecessary duplicate infrastructure.

If the current Academy system already has reusable player invitation logic, reuse it where safe.

---

# 10. Scout Support

Local Teams can have scouts.

A scout can be associated with a Local Team according to the project's existing scout/team relationship model.

However, Local Team scouts must not gain the professional evaluation powers that verified Academy workflows have.

Their role is essentially:

```text
Discover
Recommend
Support Squad Recruitment
```

They do not trigger:

```text
Online Review
Trial
Pass / Fail
Recommendation Reset
Scout Success Recalculation
```

---

# 11. CRITICAL: Recommendation Lifecycle

This is one of the most important business rules.

## Verified Academy

The existing verified Academy logic remains unchanged.

For example, if a player fails an applicable Online Coach Review or Trial, the existing system may:

- remove recommendations from the player;
- recalculate success rates of scouts who recommended that player.

Do not change this existing behavior.

## Local Team

Local Team acceptance must **NOT** modify recommendations.

Example:

Before joining:

```text
Player A

Recommendations:
- Scout X
- Scout Y
- Scout Z
```

The Local Team Manager accepts Player A into the squad.

After joining:

```text
Player A

Recommendations:
- Scout X
- Scout Y
- Scout Z
```

The recommendation list must remain exactly the same.

Do not:

- Delete recommendations.
- Clear the recommendation array.
- Recalculate scout success rates.
- Mark recommendations as successful/failed merely because the player joined a Local Team.
- Trigger any Verified Academy recommendation lifecycle.

### Business rule

> Joining a Local Team is only a squad-placement event. It is NOT a professional evaluation result.

Therefore:

```text
Local Team squad acceptance
        ↓
Recommendations unchanged
        ↓
Scout success rates unchanged
```

---

# 12. Important Business Principle

Local Teams and their assigned scouts must **not influence the player's professional evaluation lifecycle**.

They may:

```text
Discover
Recommend
Invite
Accept into squad
```

They must NOT:

```text
Online Review
Trial
Pass
Fail
Recommendation Reset
Scout Success Rate Recalculation
```

In short:

> **A Local Team can add a player to its squad, but it must not alter the player's recommendation/evaluation lifecycle.**

---

# 13. Academy Lists

Local Teams must **NOT appear in Academy lists**.

For example, a public Academy listing endpoint should effectively behave like:

```text
GET /academies

WHERE status = VERIFIED
```

Local Teams:

```text
status = UNVERIFIED
```

must be excluded.

This should apply to relevant Academy discovery/listing functionality, including:

- Public Academy lists.
- Academy search.
- Academy discovery.
- Academy directory.
- Academy recommendation/discovery surfaces.

Do not accidentally expose Local Teams as Verified Academies.

A Local Team can still have its own profile/detail page if the product requires it.

---

# 14. Player Profile — Current Squad

Add current squad information to the Player Profile.

The profile should clearly show whether the player currently belongs to:

1. A Verified Academy.
2. A Local Team.
3. No Academy/Local Team squad.

Example:

```text
Current Squad

Academy: FC Example
Type: Verified Academy
```

or:

```text
Current Squad

Team: Example Local Team
Type: Local Team
```

If the player is not currently in any Academy/Local Team squad:

```text
Current Squad

Not currently in an academy or local team squad.
```

Prefer returning the underlying status from the backend rather than trying to infer it entirely on the frontend.

Example response:

```json
{
  "squad": {
    "academyId": "...",
    "academyName": "...",
    "status": "VERIFIED"
  }
}
```

or:

```json
{
  "squad": {
    "academyId": "...",
    "academyName": "...",
    "status": "UNVERIFIED"
  }
}
```

If there is no squad:

```json
{
  "squad": null
}
```

Use the project's existing API response conventions if they differ.

---

# 15. Permission Architecture

Do not implement this feature using frontend-only conditional rendering.

Backend authorization must explicitly distinguish:

```text
VERIFIED Academy Manager
```

from:

```text
UNVERIFIED Academy / Local Team Manager
```

Conceptually:

```text
if academy.status === VERIFIED:
    existing Academy permissions

if academy.status === UNVERIFIED:
    Local Team permissions
```

Local Team should receive:

```text
Dashboard
Feed
Inbox
Squad
Players
Player Invitation
Player Squad Acceptance
Scout Assignment/Acceptance
```

Local Team should NOT receive:

```text
Coach Management
Coach Creation
Coach Transfer
Online Coach Review
Trial Management
Trial Creation
Trial Pass/Fail
```

---

# 16. Backend Authorization

The following operations must be rejected for Local Teams:

```text
Create Coach
Transfer Coach
Assign Coach
Create Trial
Apply to Trial
Accept Trial
Reject Trial
Create Online Coach Review
Accept Coach Review
Reject Coach Review
Pass Trial
Fail Trial
```

Use the project's existing HTTP error/authorization conventions, such as `403 Forbidden` where appropriate.

Example conceptual tests:

```text
POST /coach
Local Team → 403

POST /coach/transfer
Local Team → 403

POST /trial
Local Team → 403

POST /coach-review
Local Team → 403
```

But:

```text
POST /squad/player
Local Team → allowed

POST /squad/scout
Local Team → allowed
```

Do not assume these exact endpoint names; inspect the repository and use the real endpoints.

---

# 17. Database Migration

First inspect the existing Prisma/database schema.

If Academy does not already have a suitable status/type field, add one according to the existing project's conventions.

For example:

```prisma
enum AcademyStatus {
  VERIFIED
  UNVERIFIED
}
```

Existing Academies must remain:

```text
VERIFIED
```

The migration must not break existing Academy records or relationships.

Do not introduce a separate `Team` table unless repository analysis proves that the existing Academy model cannot safely represent the Local Team concept.

---

# 18. Redis / Cache

Audit all Academy-related Redis caching.

Check:

```text
Academy list
Academy detail
Player profile
Squad
Manager dashboard
```

When Local Teams are introduced, ensure `UNVERIFIED` records do not accidentally enter cached Verified Academy lists.

Also inspect cache invalidation for:

- Academy creation/update.
- Local Team creation/update.
- Squad changes.
- Player squad membership.
- Player profile.

Follow the project's existing Redis invalidation conventions.

---

# 19. Frontend Routing

Local Team Manager routes should expose only functionality appropriate to Local Teams.

Example conceptual structure:

```text
/local-team/dashboard
/local-team/feed
/local-team/inbox
/local-team/squad
/local-team/players
```

However, do not blindly create new route structures if the current project already uses shared Academy Manager routes.

If shared routes are used, determine the current Academy status and render the correct isolated workflow.

Verified Academy Manager:

```text
Existing routes and behavior
```

Local Team Manager:

```text
Dashboard
Feed
Inbox
Squad
Players
```

No Trials or Coach Management.

---

# 20. UI Terminology

User-facing labels should be clear.

For verified organizations:

```text
Verified Academy
```

For unverified organizations:

```text
Local Team
```

For the Uzbek product:

```text
Mahalliy Jamoa
```

Avoid exposing raw implementation terminology such as:

```text
UNVERIFIED
```

unless it is specifically needed as a technical/admin status.

On Player Profile, a badge could show:

```text
Verified Academy
```

or:

```text
Local Team
```

---

# 21. Repository Audit Before Implementation

Before writing code, inspect the existing repository and identify:

- Academy Prisma model.
- Academy status/type fields.
- Academy creation flow.
- Academy Manager role/permissions.
- Academy list endpoints.
- Academy profile endpoints.
- Academy Manager frontend routes.
- Academy Manager navbar.
- Coach model.
- Coach creation.
- Coach transfer.
- Coach permissions.
- Online Coach Review model/workflow.
- Trial model/workflow.
- Player invitation flow.
- Squad membership logic.
- Scout assignment logic.
- Recommendation lifecycle.
- Scout success-rate calculation.
- Player Profile API and UI.
- Redis keys.
- Redis invalidation.
- Existing guards/policies.
- Existing unit/integration/e2e tests.

Use the repository's actual architecture as the source of truth.

Do not invent endpoint names, services, DTOs, or models before inspecting the code.

---

# 22. Implementation Strategy

Implement in this order:

1. Audit the current Academy architecture.
2. Identify the correct Academy status/type representation.
3. Add `VERIFIED / UNVERIFIED` if necessary.
4. Ensure all existing Academies are `VERIFIED`.
5. Add Local Team manager permissions.
6. Isolate Local Team navigation/routes.
7. Disable Coach functionality for Local Teams.
8. Disable Online Coach Review for Local Teams.
9. Disable Trial functionality for Local Teams.
10. Reuse existing Player Invite/Squad logic where appropriate.
11. Allow Local Teams to accept/add scouts.
12. Ensure Local Team squad acceptance does not modify recommendations.
13. Ensure Local Team squad acceptance does not recalculate scout success rates.
14. Filter `UNVERIFIED` organizations from Academy lists.
15. Add current squad/type information to Player Profile.
16. Audit Redis caching and invalidation.
17. Add backend authorization.
18. Add unit/integration/e2e tests.
19. Run existing Verified Academy regression tests.
20. Verify that the existing Verified Academy workflow remains unchanged.

---

# 23. Code Organization Principle

Avoid creating a massive conditional mess throughout the codebase.

Prefer clear separation of business rules.

Conceptually:

```text
Shared:
- Squad
- Player invitation
- Player acceptance
- Scout assignment
- Player listing
- Feed
- Inbox

Verified Academy-specific:
- Coach
- Online Coach Review
- Trials
- Pass/Fail
- Recommendation lifecycle
- Scout success-rate recalculation

Local Team-specific:
- No Coach
- No Online Review
- No Trials
- Squad placement only
- Recommendations remain unchanged
- Scout success rate remains unchanged
```

Reuse shared services where safe.

Keep organization-specific business rules explicit.

---

# 24. Critical Regression Requirement

The most important acceptance criterion is:

> **Everything that currently works for Verified Academies must continue to work exactly as before.**

Do not accidentally change:

- Verified Academy permissions.
- Coach behavior.
- Coach transfers.
- Online Reviews.
- Trials.
- Trial Pass/Fail.
- Recommendation cleanup.
- Scout success-rate calculations.
- Academy lists.
- Academy Manager navigation.
- Existing Academy squad behavior.

The new Local Team feature must behave as an isolated extension.

---

# 25. Acceptance Criteria

## Verified Academy

- Existing Academy behavior remains unchanged.
- Coaches continue to work.
- Online Coach Review continues to work.
- Trials continue to work.
- Pass/Fail continues to work.
- Recommendation lifecycle continues to work.
- Scout success-rate recalculation continues to work.
- Verified Academies remain visible in Academy lists.

## Local Team

- `UNVERIFIED` Academy is presented as `Local Team / Mahalliy Jamoa`.
- Local Team Manager can log in.
- Navbar contains:
  - Dashboard
  - Feed
  - Inbox
  - Squad
  - Players
- No Trials menu.
- No Coach menu.
- Manager can invite players.
- Manager can accept players into the squad.
- Manager can accept/add scouts.
- Local Team has no Coaches.
- Local Team cannot create Coaches.
- Local Team cannot transfer Coaches.
- Local Team cannot create Trials.
- Local Team cannot use Online Coach Review.
- Local Teams do not appear in Verified Academy lists.
- Player Profile shows the player's current squad.
- Player Profile identifies whether the squad belongs to a Verified Academy or Local Team.
- Player Profile clearly indicates when the player is not in any Academy/Local Team squad.
- Adding a player to a Local Team does not remove recommendations.
- Adding a player to a Local Team does not change recommendations.
- Adding a player to a Local Team does not recalculate scout success rates.
- Local Team scouts cannot trigger Verified Academy evaluation workflows.
- Redis/cache behavior does not leak Local Teams into Verified Academy lists.

---

# 26. Final Requirement

Before implementation, provide a concise implementation plan based on the actual repository.

Then implement the feature.

Do not make assumptions about the existing architecture.

Do not create a separate `Team` model unless the existing codebase demonstrates that reusing `Academy` is technically unsafe or would create unacceptable complexity.

The default architecture should be:

```text
                    Academy Model
                         |
              +----------+----------+
              |                     |
           VERIFIED              UNVERIFIED
              |                     |
      Verified Academy           Local Team
              |                     |
       Existing workflow        Simplified workflow
              |                     |
       Coach + Review             No Coach
       Trials + Pass/Fail         No Review
       Recommendation             No Trials
       lifecycle                  Squad only
       Scout recalculation        Recommendations unchanged
                                  Scout success unchanged
```

**The existing Verified Academy system is the source of truth and must remain backward-compatible.**
