# FotSpot — Player Squad, Current Academy, Academy History & Mahalliy Jamoa

Implement this feature completely in the existing FotSpot repository.

## Important

- Inspect the existing Academy, Player, Squad, Invitation, Notification, and **Mahalliy Jamoa** implementations before changing anything.
- Reuse existing models, services, components, APIs, authorization, notifications, i18n, and cache patterns where possible.
- Do not create duplicate concepts if an existing model can be extended.
- Preserve existing Academy, Trial, Recommendation, Coach, and Mahalliy Jamoa functionality.
- Implement the feature in the repository; do not only describe the solution.

---

## 1. Player Dashboard — "My Card"

For the `Player` role, update:

```text
/dashboard
```

specifically the **My Card** section.

Add a **Current Squad** area/card that clearly shows the player's current football memberships.

The UI should distinguish:

1. Current Academy
2. Current Mahalliy Jamoalar

Example:

```text
My Card

Current Academy
┌─────────────────────────────┐
│ Bunyodkor Academy           │
│ Squad: U17                  │
│ Position: ST                │
│ [View Academy]              │
└─────────────────────────────┘

Mahalliy Jamoalar
┌─────────────────────────────┐
│ G'uzor FC                   │
│ Squad: U18                  │
│ [View Team]                 │
└─────────────────────────────┘
```

If the player has no current Academy, show an appropriate empty state.

If the player has no Mahalliy Jamoa, show an appropriate empty state.

Follow the existing FotSpot design system and responsive behavior.

---

## 2. Academy and Mahalliy Jamoa Details

Academy details must be accessible through:

```text
/academies/:id
```

If this route already exists, extend it rather than creating another route.

A Player should be able to open their current Academy and see the existing read-only Academy details.

Mahalliy Jamoalar must also use:

```text
/academies/:id
```

for their details because Mahalliy Jamoa follows the Academy-like model already introduced.

The route must correctly determine whether the entity is an Academy or Mahalliy Jamoa and display the appropriate information.

Do not create a separate route such as `/local-teams/:id` unless the existing architecture explicitly requires it.

Players must not see Academy Manager editing controls.

---

## 3. Academy Membership Rule — Maximum One Current Academy

A Player can have **only one current Academy**.

Example:

```text
Player B
Current Academy:
Bunyodkor Academy
```

If another Academy sends an invitation and the Player accepts it:

```text
Bunyodkor Academy
        ↓
Player accepts Paxtakor invitation
        ↓
Paxtakor Academy becomes current
```

The Player must never end up with two active/current Academy memberships.

---

## 4. Academy History Must Be Preserved

When a Player changes Academy, the previous verified Academy membership must NOT be deleted.

Example:

```text
Bunyodkor Academy
        ↓
Player transfers
        ↓
Paxtakor Academy
```

Expected state:

```text
Current Academy:
Paxtakor Academy

Academy History:
Bunyodkor Academy
```

Historical membership should preserve appropriate information such as:

- Academy
- Squad, if available
- `joinedAt`
- `leftAt`
- membership status/reason if supported by the existing domain

Do not simply overwrite the previous Academy ID.

Do not delete historical verified Academy membership.

---

## 5. Academy Transfer Rules

A Player cannot manually switch their Academy.

The Academy can change only through valid domain actions:

### Case A — New Academy invitation

```text
Current Academy:
Bunyodkor

Paxtakor sends invitation

Player accepts

→ Paxtakor becomes current
→ Bunyodkor becomes history
```

### Case B — Current Academy Manager removes Player

```text
Current Academy:
Bunyodkor

Manager removes Player

→ Player no longer has a current Academy
→ Bunyodkor membership remains in history
```

### Case C — Player cannot voluntarily leave Academy

Do NOT provide a working `Leave Academy` action for Players.

A Player can leave their current Academy only by:

1. accepting an invitation from another Academy, or
2. being removed by the current Academy Manager.

---

## 6. Academy Removal Warning

When an Academy Manager removes a Player from the Academy squad, require a confirmation/warning.

Example:

```text
Remove Player?

This player will be removed from the current academy squad.
Their academy membership will remain in academy history.

[Cancel] [Remove Player]
```

Use the existing confirmation/modal component if available.

Do not silently remove the Player.

---

## 7. Mahalliy Jamoa Membership Rules

A Player can belong to **multiple Mahalliy Jamoalar simultaneously**.

Example:

```text
Current Academy:
Paxtakor Academy

Mahalliy Jamoalar:
G'uzor FC
Nasaf Youth
Qashqadaryo United
```

There is no one-team limitation for Mahalliy Jamoalar.

Changing Academy must not remove Mahalliy Jamoa memberships.

Joining or leaving a Mahalliy Jamoa must not change the Player's current Academy.

---

## 8. Player Can Voluntarily Leave a Mahalliy Jamoa

Unlike Academy membership, a Player may voluntarily leave a Mahalliy Jamoa.

Provide an appropriate action:

```text
Leave team
```

Require confirmation:

```text
Leave G'uzor FC?

You will be removed from this team's squad.

[Cancel] [Leave Team]
```

After leaving:

- remove the Player from the team's active squad
- remove the team from the Player's current Mahalliy Jamoalar
- do not create a historical membership record unless the existing domain explicitly requires it

---

## 9. Academy + Mahalliy Jamoa Can Coexist

A Player may simultaneously have:

```text
1 current Academy
+
0..N Mahalliy Jamoalar
```

Example:

```text
Current Academy:
Paxtakor Academy

Mahalliy Jamoalar:
G'uzor FC
Nasaf Youth
```

This must be supported by both backend and frontend.

---

## 10. Squad Membership Model

Inspect the existing Squad implementation before modifying the schema.

The domain should support:

```text
Player
├── current Academy membership: 0..1
└── Mahalliy Jamoa memberships: 0..N

Academy membership history: 0..N
Mahalliy Jamoa history: not required
```

Reuse existing Squad relationships if possible.

If schema changes are necessary:

- update Prisma schema
- create a safe migration
- preserve existing data
- add appropriate indexes/constraints

Do not delete existing membership data.

---

## 11. Academy Transfer Must Be Atomic

Accepting a new Academy invitation must be handled atomically.

Conceptually:

```text
Accept Paxtakor invitation

1. Close current Bunyodkor membership
2. Preserve Bunyodkor in Academy history
3. Create/activate Paxtakor current membership
4. Add Player to the correct Paxtakor squad
5. Mark invitation accepted
6. Generate appropriate notifications
```

Use a database transaction.

Do not allow partial states such as:

```text
Paxtakor accepted
+
Bunyodkor still current
```

or:

```text
Bunyodkor removed
+
Paxtakor not added
```

---

## 12. Academy Invitation Validation

Inspect the existing invitation business rules.

A Player must never have two active Academy memberships after accepting an invitation.

If the current system allows invitations while the Player belongs to another Academy, accepting the new invitation must safely transfer the Player.

If the existing product rules prohibit sending such invitations, preserve that behavior.

Do not introduce conflicting invitation semantics.

---

## 13. Squad Join/Leave Notifications

Whenever a Player joins or leaves a squad, create a notification.

This applies to both:

- Academy
- Mahalliy Jamoa

The notification must include the Player's name.

Conceptually:

```text
{playerName} joined your squad.
```

and:

```text
{playerName} left your squad.
```

Use the existing notification system.

Do not create a separate notification infrastructure.

---

## 14. Notification Recipients

Inspect the existing notification architecture.

At minimum, the relevant Academy Manager or Mahalliy Jamoa Manager must receive notifications when a Player:

- joins their squad
- leaves their squad

If the existing product already notifies Coaches or other squad-management users, follow those existing conventions.

Do not notify unrelated users.

---

## 15. Academy Transfer Notifications

When a Player transfers:

```text
Bunyodkor
    ↓
Paxtakor
```

generate appropriate notifications through the existing notification system.

At minimum, ensure the new Academy side receives the Player's join notification.

If the existing notification architecture supports departure notifications, generate the corresponding notification to the old Academy as well.

Use the Player's actual display name.

---

## 16. Notification Localization

Use the existing i18n/localization system.

Do not hardcode notifications in only one language if FotSpot supports multiple locales.

Conceptually:

```text
{playerName} joined your squad.
{playerName} left your squad.
```

Add translations through the existing localization architecture.

Do not create a new i18n system.

---

## 17. Notification Timing and Duplicate Prevention

Notifications must only be generated after the membership operation succeeds.

For example:

```text
Database transaction succeeds
        ↓
membership changed
        ↓
notification created
```

Do not create a "joined" notification if the underlying transaction failed.

Avoid duplicate notifications on retries or repeated requests.

Follow the existing notification architecture.

---

## 18. Player Dashboard Data

The `/dashboard` My Card section must determine current Academy from an active/current membership.

Do NOT infer the current Academy from Academy history.

Example:

```text
Current Academy:
Paxtakor

Academy History:
Bunyodkor
```

Bunyodkor must not appear as current.

---

## 19. Academy History UI

If the existing Player profile/dashboard already has an appropriate history area, integrate Academy history there.

Otherwise add a compact section in a logical location.

Example:

```text
Academy History

Paxtakor Academy
Current

Bunyodkor Academy
2024 – 2026
```

Do not duplicate the current membership as a historical record unless it has actually ended.

---

## 20. Mahalliy Jamoalar UI

Display all current Mahalliy Jamoa memberships.

Each team should link to:

```text
/academies/:id
```

Example:

```text
Mahalliy Jamoalar

┌───────────────────┐
│ G'uzor FC         │
│ U18               │
│ [View Team]       │
│ [Leave Team]      │
└───────────────────┘

┌───────────────────┐
│ Nasaf Youth       │
│ U17               │
│ [View Team]       │
│ [Leave Team]      │
└───────────────────┘
```

Do not use a separate detail route.

---

## 21. Role Restrictions

### Player

Can:

- view own current Academy
- view Academy history
- view current Mahalliy Jamoalar
- view Academy/Mahalliy Jamoa details
- accept Academy invitations
- voluntarily leave Mahalliy Jamoalar

Cannot:

- voluntarily leave Academy
- edit Academy
- modify another Player's squad membership

### Academy Manager

Can:

- manage their own Academy squad
- remove Players from their own Academy
- receive relevant squad notifications

Cannot:

- manage another Academy's squad

### Mahalliy Jamoa Manager

Can:

- manage their own Mahalliy Jamoa squad
- receive relevant squad notifications

Cannot:

- manage another team's squad
- modify Academy membership

---

## 22. Backend Authorization

Frontend restrictions are not sufficient.

Verify backend authorization for:

- accepting Academy invitations
- Academy transfer
- Academy removal
- joining a Mahalliy Jamoa
- leaving a Mahalliy Jamoa
- squad membership changes

A Player must not be able to manipulate membership through direct API requests.

Managers must only manage their own Academy/Mahalliy Jamoa.

---

## 23. API Design

Inspect existing endpoints first.

Prefer extending existing endpoints instead of creating duplicates.

Potential operations include:

```text
GET current squad
GET Academy history
GET Mahalliy Jamoalar
POST accept Academy invitation
POST leave Mahalliy Jamoa
DELETE/remove Player from squad
```

Use existing API response and error conventions.

Do not create duplicate endpoints if equivalent functionality already exists.

---

## 24. Database Integrity

If schema changes are necessary:

- use Prisma migrations
- preserve existing data
- add appropriate indexes
- add appropriate unique constraints
- avoid destructive migrations unless absolutely necessary

The important invariants are:

```text
Player + active Academy = maximum 1
```

```text
Player + active Mahalliy Jamoa = 0..N
```

```text
Academy history = preserved
```

```text
Mahalliy Jamoa history = not required
```

---

## 25. Redis / Cache Invalidation

Inspect the existing Redis/cache implementation.

If current squad, Academy membership, Player profile, or dashboard data is cached, invalidate/update relevant cache entries after:

- Academy transfer
- Academy removal
- Mahalliy Jamoa join
- Mahalliy Jamoa leave
- squad membership changes

Avoid stale dashboard/profile states.

Example:

```text
Player leaves G'uzor FC
        ↓
cache invalidated
        ↓
/dashboard refetch
        ↓
G'uzor FC no longer appears
```

Use the existing cache conventions.

Do not introduce Redis caching if the relevant data is not currently cached.

---

## 26. Existing Trial and Recommendation Logic

Do not break existing:

- Global Trials
- Private Trials
- Coach reviews
- Recommendations
- Academy squad placement
- Mahalliy Jamoa
- Notifications

The new membership rules must integrate with the existing domain.

---

## 27. Testing Scenarios

### Case 1 — Player has no Academy

```text
Current Academy:
None

Mahalliy Jamoalar:
0..N
```

Valid.

### Case 2 — Player joins Academy

```text
Player
→ accepts Academy invitation
→ Academy becomes current
→ join notification created
```

### Case 3 — Academy transfer

Initial:

```text
Current Academy:
Bunyodkor
```

Player accepts:

```text
Paxtakor invitation
```

Expected:

```text
Current Academy:
Paxtakor

Academy History:
Bunyodkor
```

Never:

```text
Bunyodkor current
+
Paxtakor current
```

### Case 4 — Player cannot leave Academy

There must be no working API/UI allowing:

```text
Player → Leave Academy
```

### Case 5 — Academy Manager removes Player

```text
Academy Manager
→ Remove Player
→ warning/confirmation
→ confirm
→ Player leaves current Academy
→ Academy membership preserved in history
→ notification generated
```

### Case 6 — Multiple Mahalliy Jamoalar

A Player can simultaneously belong to:

```text
G'uzor FC
+
Nasaf Youth
+
Another Local Team
```

### Case 7 — Player leaves Mahalliy Jamoa

```text
Player
→ Leave G'uzor FC
→ confirmation
→ removed from squad
→ G'uzor FC disappears from current local teams
→ notification generated
```

No history record is required.

### Case 8 — Academy + Mahalliy Jamoa coexist

```text
Current Academy:
Paxtakor

Mahalliy Jamoalar:
G'uzor FC
Nasaf Youth
```

All remain active simultaneously.

### Case 9 — Notifications

Verify:

```text
Player joins Academy
→ relevant manager notification

Player leaves Academy
→ relevant manager notification

Player joins Mahalliy Jamoa
→ relevant manager notification

Player leaves Mahalliy Jamoa
→ relevant manager notification
```

Notifications must contain the Player's name.

---

## 28. Final Verification

Run all relevant checks.

### Backend

```text
typecheck
lint
tests
```

### Frontend

```text
typecheck
lint
build
```

### Prisma

If the schema changed:

```text
prisma validate
migration verification
```

Inspect the final Git diff.

Make sure:

- no unrelated files were modified
- no debugging code remains
- no duplicate models were introduced unnecessarily
- no duplicate API endpoints were created unnecessarily
- no existing Trial/Recommendation behavior was broken
- no authorization bypass exists

---

## Final Report

After implementation, report:

1. Files created.
2. Files modified.
3. Dashboard "My Card" changes.
4. Current Academy implementation.
5. Academy history implementation.
6. Mahalliy Jamoa multi-membership implementation.
7. Academy transfer behavior.
8. Academy removal behavior.
9. Player voluntary Mahalliy Jamoa leave behavior.
10. Squad notification implementation.
11. Database/migration changes.
12. Redis/cache invalidation.
13. Authorization/security changes.
14. Tests/typecheck/lint/build results.
15. Any remaining limitations.

**Important: implement all requested functionality in the repository. Do not stop after analysis or provide only recommendations.**
