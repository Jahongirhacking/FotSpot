# FotSpot — Definitive Domain Logic & Business Rules

You are working on **FotSpot**, a football talent discovery and academy management platform.

This document defines the **canonical business logic** for Players, Scouts, Academies, Coaches, Recommendations, Online Coach Reviews, Trials, and Squad placement.

Before implementing, modifying, refactoring, or designing any feature related to these domains, you MUST follow the rules in this document.

Do not invent alternative interpretations of these business rules.

---

# 1. Core Platform Concept

FotSpot connects:

- Young football Players
- Scouts
- Football Academies
- Academy Managers
- Coaches

The platform provides a structured pipeline for discovering football talent, evaluating Players online, conducting real-life football Trials, and eventually placing successful Players into Academy Squads.

The core pipeline is:

```text
Player Discovery
      ↓
Recommendation / Trial Application
      ↓
Online Coach Review (only where required)
      ↓
Real-Life Trial
      ↓
Coach PASS / FAIL
      ↓
If PASS → Academy Manager can add Player to Squad
```

The system MUST strictly distinguish between:

1. **Online Coach Review**
2. **Trial**

They are different domain concepts.

---

# 2. User Roles

FotSpot has the following roles:

- Guest
- Player
- Scout
- Academy Manager
- Coach
- Admin
- Super Admin

---

# 3. Guest

A Guest is an unauthenticated user.

Guests can browse the platform similarly to Scouts.

A Guest can:

- Browse Player profiles
- View Player information
- Watch Player videos
- Browse publicly available content

A Guest cannot:

- Recommend Players
- Like content
- Follow Players
- Apply to Trials
- Participate in Academy processes
- Perform authenticated actions

After registration, the user chooses one of the available user roles:

- Player
- Scout

---

# 4. Player

A Player creates a professional football profile on FotSpot.

The Player profile is based on football-related information and **video proof** rather than a traditional CV.

Players can upload videos demonstrating abilities such as:

- Technique
- Dribbling
- Ball control
- Passing
- Shooting
- Other football skills

The Player profile may contain:

- Position
- Playing style
- Statistics
- Football information
- Skill videos
- Video proof
- Recommendations from Scouts

Players can:

- Create their football profile
- Edit their profile
- Upload football videos
- Browse Global Trials
- Apply to Global Trials
- Receive recommendations
- Receive Private Trial invitations
- Participate in Trials
- Potentially join Academy Squads

---

# 5. Scout

A Scout discovers and recommends talented Players.

A Scout can discover Players through:

1. Player profiles
2. The video feed
3. Other discovery mechanisms available on FotSpot

A Scout can recommend a Player.

There are two important recommendation contexts:

### Global Recommendation

A Scout can recommend a Player through the global scouting system.

### Academy Recommendation

If a Scout is hired by an Academy, the Scout can recommend a Player directly to that Academy.

The Academy-specific recommendation appears in the Academy Inbox.

---

# 6. Scout Success Rating

Scout Success Rating is a reputation mechanism.

The goal is NOT to reward Scouts simply for making many recommendations.

The goal is to measure the **quality and outcome of their recommendations**.

A Scout's Success Rating is affected by the eventual evaluation outcomes of Players they recommended.

The Success Rating MUST be recalculated when one of the following outcomes is finalized:

```text
Online Coach Review → REJECT
```

or

```text
Trial → FAIL
```

or

```text
Trial → PASS
```

The exact mathematical algorithm for calculating the Success Rating is a separate business rule and should be implemented independently.

The important domain requirement is:

> Whenever a relevant Online Coach Review or Trial decision is finalized, the Success Rating of Scouts associated with the Player's recommendations must be recalculated.

---

# 7. Critical Terminology: Trial

Whenever the system or product uses the term **Trial**, it ALWAYS means a:

> **Real-life/offline football examination conducted by a Coach.**

A Trial is NOT an online profile review.

A Trial requires the Player to physically attend the Academy or designated football environment.

During a Trial:

1. The Player physically attends the Trial.
2. The Coach tests/evaluates the Player's actual football abilities.
3. The Coach enters a final verdict.

The final Trial verdict is:

```text
PASS
```

or:

```text
FAIL
```

---

# 8. Trial PASS

When the Coach gives:

```text
PASS
```

the Player has successfully passed the real-life football examination.

The following actions MUST occur:

1. The Player becomes eligible for Academy Squad placement.
2. The Academy Manager can add the Player to the Squad.
3. The Player's `recommendations` array MUST be emptied/cleared.
4. The Success Rating of every Scout who recommended this Player MUST be recalculated.
5. The successful Trial outcome must be reflected in the affected Scouts' Success Ratings.

Conceptually:

```text
Trial → PASS
    ↓
Player passed real-life examination
    ↓
Clear Player.recommendations
    ↓
Recalculate affected Scouts' Success Ratings
    ↓
Player becomes eligible for Squad placement
    ↓
Academy Manager can add Player to Squad
```

Important:

> A Coach PASS during a Trial does not itself automatically add the Player to the Squad.

The **Academy Manager** is responsible for adding the Player to the Squad.

---

# 9. Trial FAIL

When the Coach gives:

```text
FAIL
```

the Player did not successfully pass the real-life football examination.

The following must occur:

1. The Player is not eligible for Squad placement based on that Trial.
2. The Player is not added to the Academy Squad based on that Trial.
3. The Success Rating of every Scout who recommended this Player MUST be recalculated.

Conceptually:

```text
Trial → FAIL
    ↓
Player failed real-life examination
    ↓
Recalculate affected Scouts' Success Ratings
    ↓
Player is not added to Squad
```

Do NOT clear the Player's `recommendations` array merely because a Trial failed.

The recommendation-clearing rule applies specifically to:

```text
Trial → PASS
```

---

# 10. Important Terminology: Online Coach Review

**Online Coach Review** is completely different from a Trial.

Online Coach Review means:

> An Academy sends a Player's profile to a Coach, and the Coach reviews the Player's profile online.

The Coach does NOT physically test the Player during an Online Coach Review.

The Coach reviews information such as:

- Player profile
- Position
- Playing style
- Statistics
- Video proof
- Uploaded football videos
- Existing recommendations
- Other available Player information

The Coach then makes an online decision:

```text
ACCEPT
```

or:

```text
REJECT
```

---

# 11. Online Coach Review — ACCEPT

If the Coach gives:

```text
ACCEPT
```

during Online Coach Review:

- The Player has passed the online screening.
- The Player becomes eligible to receive a Private Trial invitation.
- The Academy Manager can invite the Player to a Private Trial.

Important:

> Online Coach Review ACCEPT does NOT mean the Player passed a football Trial.

It only means:

> The Coach believes the Player deserves an opportunity to attend a real-life Private Trial.

The Player still has to attend and pass the offline Trial.

---

# 12. Online Coach Review — REJECT

If the Coach gives:

```text
REJECT
```

during Online Coach Review:

- The online screening process ends.
- The Player does not proceed to the Private Trial through that review.
- The Player is not added to the Squad based on this review.
- The Success Rating of every Scout associated with the Player's recommendations MUST be recalculated.

Conceptually:

```text
Online Coach Review → REJECT
        ↓
Online review ends
        ↓
Recalculate affected Scouts' Success Ratings
        ↓
No Private Trial
```

Important:

> Online Coach Review REJECT triggers Scout Success Rating recalculation, but it does NOT clear the Player's recommendations array.

---

# 13. Online Coach Review vs Trial

These concepts MUST remain separate throughout the entire application.

| Concept                            | Online Coach Review | Trial                                        |
| ---------------------------------- | ------------------- | -------------------------------------------- |
| Type                               | Online              | Real-life / Offline                          |
| Purpose                            | Initial screening   | Football examination                         |
| Player physically attends?         | No                  | Yes                                          |
| Coach reviews profile?             | Yes                 | May use profile, but physically tests Player |
| Coach decision                     | ACCEPT / REJECT     | PASS / FAIL                                  |
| Can lead to Private Trial?         | ACCEPT              | N/A                                          |
| Can lead to Squad placement?       | No                  | PASS makes Player eligible                   |
| Clears recommendations?            | No                  | PASS does                                    |
| Recalculates Scout Success Rating? | REJECT              | PASS and FAIL                                |

The most important rule is:

> **Online Coach Review determines whether a Player deserves an opportunity to attend a Private Trial.**

> **Trial determines whether the Player has actually passed the real-life football examination.**

---

# 14. Trial Types

FotSpot has two Trial types:

1. Global Trial
2. Private Trial

Both are **real-life/offline football examinations**.

Both require a Coach to physically test the Player.

Both result in:

```text
PASS
```

or:

```text
FAIL
```

The difference between them is how the Player reaches the Trial.

---

# 15. Global Trial

A Global Trial is an Academy-announced Trial.

It is visible to eligible Players on FotSpot.

A Player can discover the Global Trial and apply directly.

A Global Trial does NOT require an Online Coach Review before the Trial.

The flow is:

```text
Academy announces Global Trial
        ↓
Global Trial becomes visible to eligible Players
        ↓
Player applies
        ↓
NO Online Coach Review
        ↓
Player attends real-life Trial
        ↓
Coach physically tests Player
        ↓
Coach enters PASS / FAIL
```

---

# 16. Global Trial — PASS

If the Coach passes the Player:

```text
Global Trial
     ↓
Coach PASS
     ↓
Player successfully passed offline examination
     ↓
Clear Player.recommendations
     ↓
Recalculate affected Scouts' Success Ratings
     ↓
Player becomes eligible for Squad placement
     ↓
Academy Manager adds Player to Squad
```

The Player's application to the Global Trial does not automatically add the Player to the Squad.

The Academy Manager performs the actual Squad placement.

---

# 17. Global Trial — FAIL

If the Coach fails the Player:

```text
Global Trial
     ↓
Coach FAIL
     ↓
Player failed offline examination
     ↓
Recalculate affected Scouts' Success Ratings
     ↓
Player is not added to Squad
```

The Player's recommendations array is NOT automatically cleared by the Trial failure.

---

# 18. Private Trial

A Private Trial is also a real-life/offline football examination.

The key difference is:

> A Private Trial is only available to a specific Player after the Player has successfully passed an Online Coach Review.

A Private Trial is not publicly available to all Players.

The Private Trial becomes visible only to the specific invited Player.

Flow:

```text
Player
   ↓
Online Coach Review
   ↓
Coach ACCEPT
   ↓
Academy Manager invites Player
to Private Trial
   ↓
Private Trial visible only to that Player
   ↓
Player attends offline Trial
   ↓
Coach physically tests Player
   ↓
Coach enters PASS / FAIL
```

---

# 19. Private Trial — PASS

```text
Online Coach Review → ACCEPT
        ↓
Private Trial
        ↓
Coach physically tests Player
        ↓
Trial → PASS
        ↓
Clear Player.recommendations
        ↓
Recalculate affected Scouts' Success Ratings
        ↓
Player becomes eligible for Squad placement
        ↓
Academy Manager can add Player to Squad
```

---

# 20. Private Trial — FAIL

```text
Online Coach Review → ACCEPT
        ↓
Private Trial
        ↓
Coach physically tests Player
        ↓
Trial → FAIL
        ↓
Recalculate affected Scouts' Success Ratings
        ↓
Player is not added to Squad
```

The Player's recommendations array is NOT cleared merely because the Trial failed.

---

# 21. Exactly Three Ways a Player Can Reach a Trial

There are exactly three supported paths for a Player to reach a Trial.

---

## CASE 1 — Global Trial Application

This is the direct/public path.

### Scenario

An Academy announces a Global Trial.

The Player discovers the Trial and applies.

There is NO Online Coach Review.

### Flow

```text
Academy
   ↓
Creates Global Trial
   ↓
Global Trial visible to eligible Players
   ↓
Player applies
   ↓
NO Online Coach Review
   ↓
Player attends offline Trial
   ↓
Coach physically tests Player
   ↓
Coach enters PASS / FAIL
```

### PASS

```text
Coach PASS
   ↓
Clear Player.recommendations
   ↓
Recalculate affected Scouts' Success Ratings
   ↓
Player becomes eligible for Squad placement
   ↓
Academy Manager adds Player to Squad
```

### FAIL

```text
Coach FAIL
   ↓
Recalculate affected Scouts' Success Ratings
   ↓
Player is not added to Squad
```

---

# 22. CASE 2 — Academy Manager Independently Finds a Player

This case does NOT originate from a hired Scout.

The Academy Manager independently discovers/finds a Player.

The Player may already have recommendations attached to their profile, for example global recommendations from Scouts.

The Academy Manager sends the Player to a Coach for an Online Coach Review.

### Flow

```text
Academy Manager finds Player
        ↓
Academy Manager sends Player to Coach
        ↓
Online Coach Review
        ↓
Coach ACCEPT / REJECT
```

---

## Case 2 — Online Review REJECT

```text
Coach REJECT
   ↓
Online review ends
   ↓
Recalculate affected Scouts' Success Ratings
   ↓
No Private Trial
```

The Player's recommendations array is NOT cleared.

---

## Case 2 — Online Review ACCEPT

```text
Coach ACCEPT
   ↓
Academy Manager invites Player
to Private Trial
   ↓
Private Trial visible only
to that Player
   ↓
Player attends offline Trial
   ↓
Coach physically tests Player
   ↓
Coach enters PASS / FAIL
```

### If Trial PASS

```text
Coach PASS
   ↓
Clear Player.recommendations
   ↓
Recalculate affected Scouts' Success Ratings
   ↓
Player becomes eligible for Squad placement
   ↓
Academy Manager adds Player to Squad
```

### If Trial FAIL

```text
Coach FAIL
   ↓
Recalculate affected Scouts' Success Ratings
   ↓
Player is not added to Squad
```

---

# 23. CASE 3 — Hired Scout Recommends a Player

This case starts with a Scout who is hired by the Academy.

The Scout discovers a Player and recommends them to the Academy.

### Flow

```text
Hired Scout discovers Player
        ↓
Scout recommends Player
        ↓
Player + recommendation
appear in Academy Inbox
        ↓
Academy sees recommendation
        ↓
Academy sends Player to Coach
        ↓
CASE 2 CONTINUES
```

The Academy does NOT directly evaluate the Player's profile.

The Academy's role at this stage is to see the recommendation and send the Player to a Coach for Online Coach Review.

From this point onward, the process is exactly the same as Case 2.

---

# 24. Case 3 — Online Coach Review

```text
Academy Inbox
      ↓
Academy sends Player to Coach
      ↓
Online Coach Review
      ↓
Coach ACCEPT / REJECT
```

### If REJECTED

```text
Coach REJECT
   ↓
Online review ends
   ↓
Recalculate affected Scouts' Success Ratings
   ↓
No Private Trial
```

### If ACCEPTED

```text
Coach ACCEPT
   ↓
Academy Manager invites Player
to Private Trial
   ↓
Player attends offline Trial
   ↓
Coach physically tests Player
   ↓
Coach PASS / FAIL
```

### If Trial PASSED

```text
Coach PASS
   ↓
Clear Player.recommendations
   ↓
Recalculate affected Scouts' Success Ratings
   ↓
Player becomes eligible for Squad placement
   ↓
Academy Manager adds Player to Squad
```

### If Trial FAILED

```text
Coach FAIL
   ↓
Recalculate affected Scouts' Success Ratings
   ↓
Player is not added to Squad
```

---

# 25. Complete FotSpot Domain Flow

The three cases can be represented as:

```text
                         ┌──────────────────────┐
                         │       PLAYER         │
                         └──────────┬───────────┘
                                    │
                    ┌───────────────┼────────────────┐
                    │               │                │
                    ▼               ▼                ▼
             GLOBAL TRIAL    ACADEMY FINDS     HIRED SCOUT
              APPLICATION        PLAYER        RECOMMENDATION
                    │               │                │
                    │               ▼                ▼
                    │        ONLINE COACH       ACADEMY INBOX
                    │           REVIEW               │
                    │               │                │
                    │          ACCEPT?               │
                    │          /     \               │
                    │       NO        YES            │
                    │       │          │             │
                    │       ▼          └─────────────┘
                    │      END               │
                    │                        ▼
                    │                 PRIVATE TRIAL
                    │                        │
                    └──────────┐             │
                               │             │
                               ▼             ▼
                         OFFLINE REAL-LIFE TRIAL
                                  │
                                  ▼
                            COACH PASS / FAIL
                                  │
                         ┌────────┴────────┐
                         │                 │
                       FAIL              PASS
                         │                 │
                         ▼                 ▼
                  Recalculate       Clear recommendations
                  Scout ratings            │
                         │          Recalculate Scout ratings
                         │                 │
                         ▼                 ▼
                        END       Player eligible for Squad
                                          │
                                          ▼
                                  ACADEMY MANAGER
                                  ADDS PLAYER TO
                                       SQUAD
```

---

# 26. Recommendation Lifecycle

Recommendations are not simple social interactions.

A recommendation represents a Scout's professional opinion that a Player may be suitable for an Academy.

The recommendation can eventually produce a real-world outcome.

The conceptual lifecycle is:

```text
Scout recommends Player
        ↓
Recommendation attached to Player
        ↓
Player enters Academy evaluation pipeline
        ↓
Online Coach Review
        ↓
ACCEPT / REJECT
        ↓
If ACCEPT → Private Trial
        ↓
Real-life Trial
        ↓
PASS / FAIL
```

---

# 27. Recommendation Array

The Player has a `recommendations` collection/array representing Scouts who have recommended the Player.

The recommendation collection is relevant to Scout Success Rating calculations.

### On Trial PASS

The Player's recommendation collection MUST be cleared:

```text
Player.recommendations = []
```

Then the affected Scouts' Success Ratings MUST be recalculated.

### On Online Review REJECT

The recommendation collection is NOT cleared.

However, affected Scouts' Success Ratings MUST be recalculated.

### On Trial FAIL

The recommendation collection is NOT cleared merely because the Trial failed.

However, affected Scouts' Success Ratings MUST be recalculated.

---

# 28. Scout Success Rating Recalculation Rules

The system MUST trigger Scout Success Rating recalculation after each of these finalized outcomes:

### Event 1

```text
Online Coach Review → REJECT
```

Action:

```text
Recalculate Success Rating
for Scouts associated with Player recommendations
```

### Event 2

```text
Trial → FAIL
```

Action:

```text
Recalculate Success Rating
for Scouts associated with Player recommendations
```

### Event 3

```text
Trial → PASS
```

Actions:

```text
Clear Player.recommendations
        ↓
Recalculate Success Rating
for affected Scouts
```

---

# 29. Important Note About Global Recommendations

A Player can have existing recommendations even when an Academy Manager independently finds the Player.

For example:

```text
Player
 ├── Global recommendation from Scout A
 ├── Global recommendation from Scout B
 └── Global recommendation from Scout C
```

The Academy Manager may find this Player independently and send them to a Coach for Online Coach Review.

The existing recommendations remain attached to the Player and can be considered during the process.

If the Online Coach Review is rejected:

```text
Coach REJECT
      ↓
Recalculate affected Scouts' Success Ratings
```

If the Player later passes a Trial:

```text
Trial PASS
      ↓
Clear recommendations
      ↓
Recalculate affected Scouts' Success Ratings
```

---

# 30. Squad Placement Rule

A Player MUST NOT automatically join a Squad because:

- A Scout recommended the Player.
- An Academy received the recommendation.
- The Academy Manager found the Player.
- The Coach accepted the Player during Online Coach Review.
- The Player applied to a Global Trial.
- The Player was invited to a Private Trial.
- The Player attended a Trial.

The Player becomes eligible for Squad placement only after:

```text
Coach → Trial → PASS
```

After that:

```text
Coach PASS
      ↓
Academy Manager
      ↓
Add Player to Squad
```

The Academy Manager is responsible for the actual Squad placement.

---

# 31. Coach Responsibilities

The Coach has two fundamentally different evaluation responsibilities.

### Online

The Coach performs:

```text
Online Coach Review
```

Decision:

```text
ACCEPT / REJECT
```

Purpose:

> Decide whether the Player deserves an opportunity to attend a Private Trial.

### Offline

The Coach performs:

```text
Trial
```

Decision:

```text
PASS / FAIL
```

Purpose:

> Determine whether the Player successfully passes the real-life football examination.

These responsibilities MUST NOT be merged into one operation.

---

## 31.1 Attribute Assessment — a third thing, and not a decision at all

Rating a Player's **attributes** (speed, passing, vision, dribbling, finishing, physical,
leadership, discipline) is NOT part of either decision above.

An Online Coach Review answers ACCEPT / REJECT.

A Trial answers PASS / FAIL.

Neither of them asks the Coach for a number, and neither of them may require one.

Attribute assessment is a **squad activity**: it is what a Coach records about a Player they
train week after week, not about a stranger they are judging for admission.

### The rule

> **A Coach may assess a Player's attributes IF AND ONLY IF that Player is in the same Group
> as the Coach, inside the same Academy Squad.**

Both sides of the "if and only if" are load-bearing:

- **Only if** — a Coach with no shared Group has no standing to put a number on a Player, even
  if they are a verified Coach, even if they are reviewing that Player online, and even if they
  are the Coach running the Trial that Player has turned up to.
- **If** — a Coach who _does_ share the Group needs no further permission. That is their squad;
  assessing it is the job.

### Why

An attribute rating is the one number on this platform a Player cannot write about themselves.
It is worth that only if whoever wrote it has actually watched the Player train. A Coach
reading clips for an Online Coach Review has seen video — enough to say "worth a look", not
enough to say "physical 62". A Coach at a Trial has seen one morning — enough to say PASS, not
enough to fill in eight attributes as though they had coached the Player for a season.

Allowing it in either place would also quietly re-merge the two decisions Rule 19 keeps apart:
a screen that asks for eight ratings _and_ a verdict is a screen where the verdict stops being
the point.

### What follows from it

1. An Online Coach Review MUST NOT accept, require, or write attribute ratings.
2. A Trial verdict MUST NOT accept, require, or write attribute ratings.
3. An attribute assessment MUST be refused unless the Coach and the Player share a Group.
4. A Player in the **Reserve** (no Group) is assessable by nobody — the Reserve is the absence
   of a Group, not a Group everybody shares.
5. A Player who has just passed a Trial is not yet assessable. They become assessable when the
   Academy Manager places them in a Squad Group (Rule 9), which is the moment somebody becomes
   responsible for coaching them.

---

# 32. Academy Manager Responsibilities

The Academy Manager is responsible for:

- Managing Academy Players
- Managing Coaches
- Managing Scouts
- Managing Squads
- Managing Groups
- Creating Global Trials
- Viewing Academy Inbox
- Sending Players to Coaches for Online Coach Review
- Inviting Players to Private Trials after Coach ACCEPT
- Adding successful Players to Squads

The Academy Manager does NOT replace the Coach in football evaluation.

The Coach performs the football evaluation.

The Academy Manager performs the administrative actions around it.

---

# 33. Academy Responsibilities in Scout Recommendations

When a hired Scout recommends a Player:

```text
Scout
   ↓
Recommendation
   ↓
Academy Inbox
```

The Academy does NOT directly approve/reject the Player profile.

Instead:

```text
Academy Inbox
      ↓
Academy sends Player to Coach
      ↓
Online Coach Review
      ↓
Coach ACCEPT / REJECT
```

This distinction must be maintained in:

- Backend permissions
- API endpoints
- Database relations
- Frontend UI
- State machines
- Notifications
- Audit logs

---

# 34. Private Trial Visibility

A Private Trial is not a publicly discoverable Trial.

It is created/invited as a result of:

```text
Online Coach Review → ACCEPT
```

The Private Trial is visible only to the specific Player who has been invited.

Other Players must not be able to discover or apply to that Private Trial.

---

# 35. Global Trial Visibility

A Global Trial is intended for public/eligible Player discovery.

The flow is:

```text
Academy creates Global Trial
       ↓
Eligible Players can discover it
       ↓
Players can apply
       ↓
Directly to offline Trial
```

No Online Coach Review is required.

---

# 36. State Separation

The backend and frontend should model Online Coach Review and Trial as separate concepts.

## Online Coach Review

Recommended conceptual states:

```text
PENDING
ACCEPTED
REJECTED
```

Meaning:

```text
PENDING  = Coach has not made a decision
ACCEPTED = Player is eligible for Private Trial invitation
REJECTED = Player does not proceed to Private Trial
```

---

## Trial

Recommended conceptual states:

```text
SCHEDULED
IN_PROGRESS
PASSED
FAILED
```

Meaning:

```text
SCHEDULED    = Trial has been scheduled
IN_PROGRESS  = Trial is currently taking place
PASSED       = Coach passed Player after real-life examination
FAILED       = Coach failed Player after real-life examination
```

Do not use `ACCEPTED` / `REJECTED` for Trial verdicts.

Use:

```text
PASS / FAIL
```

Do not use `PASS / FAIL` for Online Coach Review.

Use:

```text
ACCEPT / REJECT
```

---

# 37. Domain Vocabulary

Use these terms consistently throughout the codebase, API, database, UI, documentation, and product.

### Online Coach Review

```text
ACCEPT / REJECT
```

Online Player profile screening.

### Trial

```text
PASS / FAIL
```

Real-life/offline football examination.

### Global Trial

Public/eligible Trial announced by an Academy.

### Private Trial

Specific Trial invitation available only to the selected Player after Online Coach Review ACCEPT.

### Recommendation

A Scout's recommendation of a Player.

### Scout Success Rating

A reputation metric based on the outcomes of the Scouts' recommendations.

### Squad

Everyone on an Academy's books — its Players, Coaches, Scouts and Manager. A Squad is a
membership of the Academy, not a team sheet.

### Group

A named team inside the Squad — "U14", "First team", "Goalkeepers". Only the Academy Manager
creates Groups and decides who is in them; a Coach works with the Group they are given.

A Group is what makes a Coach responsible for a Player, and it is the only thing that permits
attribute assessment (§31.1).

### Reserve

Squad membership with **no** Group. It is where everyone lands when they join an Academy and
where they return when a Group is dissolved.

The Reserve is the _absence_ of a Group, not a Group of its own. Nobody shares a Group with a
Player in the Reserve, so nobody may assess them.

### Attribute Assessment

A Coach's ratings of a Player's speed, passing, vision, dribbling, finishing, physical,
leadership and discipline.

Not a decision, not a verdict, and never part of an Online Coach Review or a Trial. Permitted
only between a Coach and a Player who share a Group (§31.1).

---

# 38. Final Canonical Rules

The following rules are mandatory:

### Rule 1

**Trial ALWAYS means a real-life/offline football examination.**

### Rule 2

**Online Coach Review is NOT a Trial.**

### Rule 3

**Online Coach Review uses ACCEPT / REJECT.**

### Rule 4

**Trial uses PASS / FAIL.**

### Rule 5

**Global Trial does not require Online Coach Review.**

### Rule 6

**Private Trial requires Online Coach Review → ACCEPT.**

### Rule 7

**A Coach must physically test the Player during every Trial.**

### Rule 8

**Only Trial → PASS makes the Player eligible for Squad placement.**

### Rule 9

**The Academy Manager performs the actual Squad placement.**

### Rule 10

**Online Coach Review → REJECT triggers Scout Success Rating recalculation.**

### Rule 11

**Trial → FAIL triggers Scout Success Rating recalculation.**

### Rule 12

**Trial → PASS triggers Scout Success Rating recalculation.**

### Rule 13

**Trial → PASS clears the Player's `recommendations` array.**

### Rule 14

**Online Coach Review → REJECT does NOT clear the Player's recommendations.**

### Rule 15

**Trial → FAIL does NOT clear the Player's recommendations merely because of the failure.**

### Rule 16

**An Academy does not directly evaluate a Player profile after a hired Scout recommendation. The Academy sends the Player to a Coach for Online Coach Review.**

### Rule 17

**A hired Scout recommendation enters the Academy Inbox and then follows the same Online Coach Review → Private Trial pipeline as an independently discovered Player.**

### Rule 18

**A Private Trial is visible only to the specific Player invited to it.**

### Rule 19

**Do not merge Online Coach Review and Trial into one entity or business operation unless the architecture explicitly preserves their separate domain semantics.**

### Rule 20

**Do not introduce alternative interpretations of these rules without discussing them first.**

### Rule 21

**A Coach may assess a Player's attributes if and only if the Coach and the Player share a
Group inside the same Academy Squad (§31.1).**

### Rule 22

**Neither an Online Coach Review nor a Trial verdict may require, accept or write attribute
ratings. A Coach presses ACCEPT / REJECT, or PASS / FAIL, and nothing else.**

### Rule 23

**The Reserve is the absence of a Group. A Player in the Reserve shares a Group with nobody and
is therefore assessable by nobody.**

---

# 39. Canonical Short Version

For quick reference:

```text
CASE 1 — GLOBAL TRIAL

Academy creates Global Trial
        ↓
Player applies
        ↓
NO Online Coach Review
        ↓
Offline Trial
        ↓
Coach PASS / FAIL
        ↓
PASS → Clear recommendations
     → Recalculate Scout Success Ratings
     → Academy Manager can add Player to Squad

FAIL → Recalculate Scout Success Ratings
     → No Squad placement
```

```text
CASE 2 — ACADEMY FINDS PLAYER

Academy Manager finds Player
        ↓
Online Coach Review
        ↓
Coach ACCEPT / REJECT

REJECT → Recalculate Scout Success Ratings
       → End

ACCEPT → Private Trial invitation
       ↓
       Offline Trial
       ↓
       Coach PASS / FAIL

       PASS → Clear recommendations
            → Recalculate Scout Success Ratings
            → Academy Manager can add Player to Squad

       FAIL → Recalculate Scout Success Ratings
            → No Squad placement
```

```text
CASE 3 — HIRED SCOUT

Hired Scout recommends Player
        ↓
Academy Inbox
        ↓
Academy sends Player to Coach
        ↓
CASE 2 CONTINUES
        ↓
Online Coach Review
        ↓
ACCEPT / REJECT
        ↓
If ACCEPT → Private Trial
        ↓
Offline Trial
        ↓
PASS / FAIL
        ↓
PASS → Clear recommendations
     → Recalculate Scout Success Ratings
     → Academy Manager can add Player to Squad

FAIL → Recalculate Scout Success Ratings
     → No Squad placement
```

This is the **canonical FotSpot domain logic**. All future implementation decisions involving these entities should be consistent with this specification.
