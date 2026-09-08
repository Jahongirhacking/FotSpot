# FotSpot — Definitive Domain Logic & Business Rules

You are working on **FotSpot**, a football talent discovery and academy management platform.

This document defines the **canonical business logic** for Players, Scouts, Academies, Coaches, Recommendations, Trials, and Squad placement.

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

The platform provides a structured pipeline for discovering football talent, testing it at real-life football Trials, and placing successful Players into Academy Squads.

The core pipeline is:

```text
Player Discovery
      ↓
Trial Application  /  Private Trial Invitation
      ↓
Real-Life Trial
      ↓
PASS / FAIL
      ↓
If PASS → Academy Manager can add Player to Squad
```

Nothing is decided about a Player before the Trial. The Trial is the whole of the evaluation.

## 1.1 Who runs a Trial

Only the **Academy Manager** creates a Global Trial. When creating it, the Manager assigns one or more of the Academy's Coaches to it; a Trial created without naming any is worked by every Coach the Academy currently endorses.

A Private Trial is created by an invitation (§11). It is run by exactly one Coach: the Coach who sent the invitation, or the Coach the Manager named when sending it.

On both kinds of Trial, the assigned Coaches are the only people who record the verdict (§10). The Academy Manager never does.

## 1.2 There is no online review

FotSpot has **no Online Coach Review**. No Player is accepted or rejected from their profile, by anybody, at any stage.

The only evaluation a Player receives is the Trial verdict, given after they have been physically tested. Every screen, endpoint, state and notification MUST reflect this: there is no "screening", "shortlisting", "approval" or "review" step anywhere in the pipeline.

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

---

# 6. Scout Success Rating

Scout Success Rating is a reputation mechanism.

The goal is NOT to reward Scouts simply for making many recommendations.

The goal is to measure the **quality and outcome of their recommendations**.

A Scout's Success Rating is affected by the eventual outcome of the Players they recommended.

The Success Rating MUST be recalculated when one of the following outcomes is finalized:

```text
Trial → PASS
```

or

```text
Trial → FAIL
```

or

```text
Academy turns the recommendation down
```

The exact mathematical algorithm for calculating the Success Rating is a separate business rule and should be implemented independently.

The important domain requirement is:

> Whenever a Trial verdict is finalized, or an Academy turns a recommendation down, the Success Rating of Scouts associated with the Player's recommendations must be recalculated.

---

# 7. Critical Terminology: Trial

Whenever the system or product uses the term **Trial**, it ALWAYS means a:

> **Real-life/offline football examination.**

A Trial is NOT an online profile review. There is no such thing on FotSpot (§1.2).

A Trial requires the Player to physically attend the Academy or designated football environment.

During a Trial:

1. The Player physically attends the Trial.
2. The Player's actual football abilities are tested on the pitch.
3. A Coach assigned to the Trial enters a final verdict (§10).

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

When the verdict is:

```text
PASS
```

the Player has successfully passed the real-life football examination.

The following actions MUST occur:

1. The Player becomes eligible for Academy Squad placement.
2. The Player appears on the Academy Manager's dashboard as a Squad candidate (§12).
3. The Academy Manager can add the Player to the Squad.
4. The Player's `recommendations` array MUST be emptied/cleared.
5. The Success Rating of every Scout who recommended this Player MUST be recalculated.
6. The successful Trial outcome must be reflected in the affected Scouts' Success Ratings.

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

> A PASS does not itself automatically add the Player to the Squad.

The **Academy Manager** is responsible for adding the Player to the Squad.

---

# 9. Trial FAIL

When the verdict is:

```text
FAIL
```

the Player did not successfully pass the real-life football examination.

The following must occur:

1. The Player is not eligible for Squad placement based on that Trial.
2. The Player is not added to the Academy Squad based on that Trial.
3. The Player does NOT appear as a Squad candidate anywhere (§12).
4. The Success Rating of every Scout who recommended this Player MUST be recalculated.

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

A FAIL is not permanent. A second look is a second Trial, with its own application and its own verdict.

---

# 10. Who Records the Verdict

> **Only a Coach assigned to the Trial records PASS / FAIL — on a Global Trial and on a Private Trial alike.**

### Global Trial

The Academy Manager creates it and assigns one or more Coaches (§1.1). Those Coaches, and only they, pass or fail the applicants. The Manager sees the applicant list and presses nothing.

### Private Trial

The one assigned Coach — the Coach who sent the invitation, or the Coach the Manager named — passes or fails the invited Player. The Manager sees the Trial and its applicant and presses nothing.

### The Academy Manager never decides

A Manager's attempt to record a verdict, on either kind of Trial, MUST be refused by the backend, whatever the UI shows. A Manager who is also one of the assigned Coaches decides *as that Coach*. The Manager's part begins after a PASS: the Player appears on their dashboard (§12), and the Manager invites them to the Squad.

### Applies to both

- One verdict per application. A Trial answers once.
- The verdict is recorded from the Coach's participant list — quick PASS / FAIL inline — never from a separate review screen. **PASS is one press** and is recorded at once; **FAIL asks first**, in a small dialog with an optional note.
- The participant list shows, for each Player: avatar, name, age, position, gender, and where the application stands. The Manager and the assigned Coaches see it; only the Coaches act on it.

### The undo window

A verdict is written the moment the Coach presses, and **acted on** — Scouts settled, recommendations cleared, the Player and Manager told, the SMS sent — only after a short window (30 seconds). Inside that window the deciding Coach may **undo** the verdict: the row is removed, the application returns to where it was, and nothing has gone out. After the window the verdict has gone out and stands; a Manager who has already offered a squad place also closes the window. Undo is a backend operation, never a screen pretending.

### Private Trials on the Coach's dashboard

A Private Trial has exactly one Player, so the Coach's dashboard lists the **Players** of their Private Trials, each with PASS / FAIL on the row — there is no "open trial" step. Global Trials have many Players and are listed as **sessions**, each opened to judge the group.

---

# 11. Private Trial — the Invitation

A Private Trial is **an invitation to one specific Player**. Sending the invitation is what creates the Trial: there is no such thing as a Private Trial with nobody invited to it.

### Who sends it

- The **Academy Manager**, from the Player's profile ("Actions → Invite to Private Trial"), from the Academy Inbox, or wherever the Player is shown to them.
- A **Coach** of the Academy, from the Player's profile.

### What it carries

- Date and time
- Location
- A note the Player reads
- Requirements (optional)
- The Coach who will run it

### Coach assignment

- Created by a Coach → that Coach is automatically assigned. They cannot hand it to somebody else at creation.
- Created by the Academy Manager → the Manager MUST select the Coach who will run it. The backend refuses an invitation from a Manager that names nobody, or names somebody the Academy does not endorse as a Coach.

### What it produces

- One Trial of type PRIVATE, for the Player's gender, never listed anywhere.
- One application at `INVITED`, awaiting the Player's yes or no.
- A snapshot of every recommendation backing the Player, so the verdict can settle the Scouts behind them (§22).

A Player with an unanswered or confirmed invitation from the same Academy cannot be invited again until that Trial has answered.

The Player answers from their invitations. Accepting moves the application to `CONFIRMED`; declining moves it to `REJECTED`.

### Nothing reaches the Coach until the Player accepts

An invitation that has not been answered is between the Academy and the family. Until the Player accepts:

- the Player is **not** in the assigned Coach's participant list, on the dashboard or on the Trial page — only counted ("1 invitation pending"), never named;
- there are no PASS / FAIL controls for them;
- a verdict on the application is refused by the backend;
- the Coach is not shown any player-specific invitation information.

`INVITED` is not `CONFIRMED`. Only a `CONFIRMED` invitee is a participant. This is enforced in the queries and the verdict endpoint, not by a screen hiding a row.

### What the Coach is shown of a Private Trial

The session — title, date, time, location, requirements, status — and the accepted participant. **Not** the note the Manager wrote to the Player (where to come, who to ask for, a phone number): that is for the Player and the Manager, and the backend removes it from the Trial and the application before a Coach reads them.

---

# 12. Squad Candidates

Every Player who **passed** a Trial of the Academy — Global or Private — and has not yet been offered a Squad place appears on the Academy Manager's dashboard as a Squad candidate.

From there the Manager sends the Squad invitation (§25) with one press. The Player accepts or declines it.

The Manager is **not notified of the verdict itself**. PASS / FAIL is told to the Player — in-site, and by Telegram when connected — and to nobody else; the dashboard list is how the Manager learns who passed.

A Player who **failed** never appears as a candidate. Nothing is owed on a FAIL.

---

# 13. Trial Types

FotSpot has two Trial types:

1. Global Trial
2. Private Trial

Both are **real-life/offline football examinations**.

Both require the Player to be physically tested.

Both result in:

```text
PASS
```

or:

```text
FAIL
```

The difference between them is how the Player reaches the Trial. Who records the verdict is the same for both: a Coach assigned to it (§10).

---

# 14. Global Trial

A Global Trial is an Academy-announced Trial.

It is created by the Academy Manager, and only by the Academy Manager (§1.1).

It is visible to eligible Players on FotSpot. A Player can discover it and apply directly. No recommendation and no review is required.

### Notification on publishing

Publishing a Global Trial notifies **only** the Players who:

1. follow the Academy, **and**
2. match the Trial's age range, **and**
3. match one of the Trial's positions (when it names any), **and**
4. match the Trial's gender (when it is not open to everybody).

The notification is delivered in-site, and by Telegram when the Player has connected it. It is never sent to everybody.

Publishing also alerts the platform operator: one line in the Telegram chat named by `TELEGRAM_ADMIN_CHAT_ID` — the Academy, the title, the day, the place.

### Applicants

The applicant list is visible to the Academy Manager and to the Coaches assigned to the Trial. Each row shows the Player's avatar, name, age, position and gender. The assigned Coaches record PASS / FAIL inline from the list (§10); the Manager reads it.

The flow is:

```text
Academy Manager creates Global Trial, assigns Coaches
        ↓
Matching followers are notified
        ↓
Player applies
        ↓
Player attends real-life Trial
        ↓
Player is tested on the pitch
        ↓
Assigned Coach enters PASS / FAIL
```

---

# 15. Global Trial — PASS

```text
Global Trial
     ↓
Assigned Coach → PASS
     ↓
Player successfully passed offline examination
     ↓
Clear Player.recommendations
     ↓
Recalculate affected Scouts' Success Ratings
     ↓
Player becomes a Squad candidate
     ↓
Academy Manager adds Player to Squad
```

The Player's application to the Global Trial does not automatically add the Player to the Squad.

The Academy Manager performs the actual Squad placement.

---

# 16. Global Trial — FAIL

```text
Global Trial
     ↓
Assigned Coach → FAIL
     ↓
Player failed offline examination
     ↓
Recalculate affected Scouts' Success Ratings
     ↓
Player is not added to Squad
```

The Player's recommendations array is NOT automatically cleared by the Trial failure.

---

# 17. Private Trial — PASS

```text
Invitation (§11)
        ↓
Player accepts
        ↓
Private Trial
        ↓
Player is tested on the pitch
        ↓
Assigned Coach → PASS
        ↓
Clear Player.recommendations
        ↓
Recalculate affected Scouts' Success Ratings
        ↓
Player becomes a Squad candidate
        ↓
Academy Manager can add Player to Squad
```

---

# 18. Private Trial — FAIL

```text
Invitation (§11)
        ↓
Player accepts
        ↓
Private Trial
        ↓
Player is tested on the pitch
        ↓
Assigned Coach → FAIL
        ↓
Recalculate affected Scouts' Success Ratings
        ↓
Player is not added to Squad
```

The Player's recommendations array is NOT cleared merely because the Trial failed.

---

# 19. Exactly Three Ways a Player Can Reach a Trial

There are exactly three supported paths for a Player to reach a Trial. All three end on a pitch, and none of them passes through a review.

---

## CASE 1 — Global Trial Application

This is the direct/public path.

### Scenario

An Academy announces a Global Trial.

The Player discovers the Trial and applies.

### Flow

```text
Academy Manager
   ↓
Creates Global Trial
   ↓
Matching followers are notified
   ↓
Player applies
   ↓
Player attends offline Trial
   ↓
Player is tested on the pitch
   ↓
Assigned Coach enters PASS / FAIL
```

### PASS

```text
Coach PASS
   ↓
Clear Player.recommendations
   ↓
Recalculate affected Scouts' Success Ratings
   ↓
Player becomes a Squad candidate
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

## CASE 2 — The Academy Finds a Player

This case does NOT originate from a hired Scout.

The Academy Manager, or one of the Academy's Coaches, finds a Player — in search, in the feed, on a profile.

The Player may already have recommendations attached to their profile, for example global recommendations from Scouts.

Whoever found them invites them to a Private Trial from the Player's profile (§11).

### Flow

```text
Manager or Coach finds Player
        ↓
Invite to Private Trial
  (Coach → runs it themselves;
   Manager → names the Coach)
        ↓
Player accepts or declines
        ↓
Private Trial
        ↓
Assigned Coach enters PASS / FAIL
```

### PASS

```text
Coach PASS
   ↓
Clear Player.recommendations
   ↓
Recalculate affected Scouts' Success Ratings
   ↓
Player becomes a Squad candidate
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

## CASE 3 — Hired Scout Recommends a Player

A Scout hired by the Academy recommends a Player directly to it.

The recommendation lands in the Academy Inbox, ranked by credibility.

### The Manager's two answers

From the Inbox the Academy Manager does one of two things, and nothing else:

1. **Invite to Private Trial** — the same invitation as Case 2, carrying the recommendation it answers. The Trial's verdict settles the Scout.
2. **Turn down** — the recommendation is rejected; the affected Scouts' Success Ratings are recalculated; nothing is cleared.

There is no step between the Inbox and the invitation.

### Flow

```text
Hired Scout recommends Player
        ↓
Academy Inbox
        ↓
Academy Manager
   ├── turns down → recalculate Scouts → END
   └── invites to Private Trial (names the Coach)
                ↓
        Player accepts or declines
                ↓
           Private Trial
                ↓
   Assigned Coach enters PASS / FAIL
```

PASS and FAIL continue exactly as in Case 2.

---

# 20. Complete FotSpot Domain Flow

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
                    │               │                ▼
                    │               │          ACADEMY INBOX
                    │               │            /      \
                    │               │      TURN DOWN    INVITE
                    │               │           │          │
                    │               │           ▼          │
                    │               │          END         │
                    │               ▼                      │
                    │        INVITE TO PRIVATE TRIAL ◄─────┘
                    │        (Manager names Coach /
                    │         Coach runs it)
                    │               │
                    │               ▼
                    │         PLAYER ACCEPTS
                    │               │
                    ▼               ▼
              OFFLINE TRIAL    PRIVATE TRIAL
                    │               │
                    └───────┬───────┘
                            ▼
                  ASSIGNED COACH: PASS / FAIL
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
                  END       Player is a Squad candidate
                                    │
                                    ▼
                            ACADEMY MANAGER
                            ADDS PLAYER TO
                                 SQUAD
```

---

# 21. Recommendation Lifecycle

Recommendations are not simple social interactions.

A recommendation represents a Scout's professional opinion that a Player may be suitable for an Academy.

The recommendation can eventually produce a real-world outcome.

The conceptual lifecycle is:

```text
Scout recommends Player
        ↓
Recommendation attached to Player
        ↓
Academy Inbox
        ↓
Invite to Private Trial  /  Turn down
        ↓
Real-life Trial
        ↓
PASS / FAIL
```

A recommendation is `PENDING` until the Academy answers it. The Academy's answer is a Trial verdict (which settles it as ACCEPTED on PASS or REJECTED on FAIL) or a refusal from the Inbox (REJECTED). Inviting the Player takes the row out of the Inbox queue while the Trial is pending, but does not settle it.

---

# 22. Recommendation Array

The Player has a `recommendations` collection/array representing Scouts who have recommended the Player.

The recommendation collection is relevant to Scout Success Rating calculations.

When a Player is invited to a Private Trial, or applies to a Global Trial, the recommendations backing them at that moment are snapshotted onto the application. The verdict settles exactly those.

### On Trial PASS

The Player's recommendation collection MUST be cleared:

```text
Player.recommendations = []
```

Then the affected Scouts' Success Ratings MUST be recalculated.

### On Trial FAIL

The recommendation collection is NOT cleared merely because the Trial failed.

However, affected Scouts' Success Ratings MUST be recalculated.

### On the Academy turning the recommendation down

The recommendation collection is NOT cleared.

However, affected Scouts' Success Ratings MUST be recalculated.

---

# 23. Scout Success Rating Recalculation Rules

The system MUST trigger Scout Success Rating recalculation after each of these finalized outcomes:

### Event 1

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
Academy turns the recommendation down
```

Action:

```text
Recalculate Success Rating
for Scouts associated with Player recommendations
```

---

# 24. Important Note About Global Recommendations

A Player can have existing recommendations even when an Academy finds the Player independently.

For example:

```text
Player
 ├── Global recommendation from Scout A
 ├── Global recommendation from Scout B
 └── Global recommendation from Scout C
```

The Academy Manager or a Coach may find this Player independently and invite them to a Private Trial.

The existing recommendations remain attached to the Player and are snapshotted onto the application. The Trial's verdict settles them for this Academy:

```text
Trial PASS
      ↓
Clear recommendations
      ↓
Recalculate affected Scouts' Success Ratings
```

```text
Trial FAIL
      ↓
Recalculate affected Scouts' Success Ratings
```

---

# 25. Squad Placement Rule

A Player MUST NOT automatically join a Squad because:

- A Scout recommended the Player.
- An Academy received the recommendation.
- The Academy Manager or a Coach found the Player.
- The Player applied to a Global Trial.
- The Player was invited to a Private Trial.
- The Player attended a Trial.

The Player becomes eligible for Squad placement only after:

```text
Trial → PASS
```

After that:

```text
PASS
  ↓
Player appears as a Squad candidate
  ↓
Academy Manager → Invite to Squad
  ↓
Player is notified (in-site + Telegram, with a link to the answer page)
  ↓
Player accepts  →  joins the Academy's Reserve automatically
Player declines →  the invitation is closed; the Manager is told, with the Player's note
```

The Academy Manager is responsible for the invitation; the Player's yes is what places them. Nobody is added by hand.

### The Player's answer

- **Accept** is one press. It is recorded at once and acted on after a short undo window (30 seconds), during which the Player may take it back and nothing has happened. After the window the membership is written into the Reserve — no Group, no manual placement step — and the Manager is notified once, as "a player joined your squad" (in-site and Telegram).
- **Decline** asks first, in a dialog with an optional note. The invitation is closed, the Player leaves the Manager's candidate list, and the Manager is notified with the note.

### Contacts

Only an Academy Manager may see a Player's contact details — email, phone, Telegram — and only on the Player's profile. A Coach, a Scout, another Player, or a guest is never shown them; the backend withholds them rather than the screen hiding them.

---

# 26. Coach Responsibilities

A Coach's evaluation responsibility on FotSpot is one thing:

```text
Trial
```

Decision:

```text
PASS / FAIL
```

Purpose:

> Determine whether the Player successfully passes the real-life football examination on a Trial the Coach is assigned to — Global or Private.

A Coach may also:

- Invite a Player to a Private Trial from the Player's profile (§11). The Coach is assigned to run it.

A Coach does NOT review profiles, approve or reject Players online, invite anybody to a Squad, or decide a Trial they are not assigned to.

---

## 26.1 Attribute Assessment — a separate thing, and not a decision at all

Rating a Player's **attributes** (speed, passing, vision, dribbling, finishing, physical,
leadership, discipline) is NOT part of the Trial verdict.

A Trial answers PASS / FAIL.

It does not ask the decider for a number, and it may not require one.

Attribute assessment is a **squad activity**: it is what a Coach records about a Player they
train week after week, not about a stranger they are judging for admission.

### The rule

> **A Coach may assess a Player's attributes IF AND ONLY IF that Player is in the same Group
> as the Coach, inside the same Academy Squad.**

Both sides of the "if and only if" are load-bearing:

- **Only if** — a Coach with no shared Group has no standing to put a number on a Player, even
  if they are a verified Coach, and even if they are the Coach running the Trial that Player has
  turned up to.
- **If** — a Coach who _does_ share the Group needs no further permission. That is their squad;
  assessing it is the job.

### Why

An attribute rating is the one number on this platform a Player cannot write about themselves.
It is worth that only if whoever wrote it has actually watched the Player train. A Coach at a
Trial has seen one morning — enough to say PASS, not enough to fill in eight attributes as
though they had coached the Player for a season.

Allowing it at the Trial would also change what the Trial is: a screen that asks for eight
ratings _and_ a verdict is a screen where the verdict stops being the point.

### What follows from it

1. A Trial verdict MUST NOT accept, require, or write attribute ratings.
2. An attribute assessment MUST be refused unless the Coach and the Player share a Group.
3. A Player in the **Reserve** (no Group) is assessable by nobody — the Reserve is the absence
   of a Group, not a Group everybody shares.
4. A Player who has just passed a Trial is not yet assessable. They become assessable when the
   Academy Manager places them in a Squad Group (Rule 9), which is the moment somebody becomes
   responsible for coaching them.

---

# 27. Academy Manager Responsibilities

The Academy Manager is responsible for:

- Managing Academy Players
- Managing Coaches
- Managing Scouts
- Managing Squads
- Managing Groups
- Creating Global Trials and assigning their Coaches
- Viewing the Academy Inbox
- Inviting Players to Private Trials, naming the Coach who runs each
- Turning recommendations down
- Adding passed Players to Squads
- Archiving Trials

The Academy Manager does not record the verdict on any Trial; the assigned Coaches do. The Manager's part after a Trial is to invite the passed Player and add them to the Squad.

---

# 28. Academy Responsibilities in Scout Recommendations

When a hired Scout recommends a Player:

```text
Scout
   ↓
Recommendation
   ↓
Academy Inbox
```

The Academy does NOT evaluate the Player profile online.

Instead:

```text
Academy Inbox
      ↓
Academy Manager invites to Private Trial  /  turns down
      ↓
Trial → PASS / FAIL
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

# 29. Private Trial Visibility

A Private Trial is not a publicly discoverable Trial.

It is visible **only** to:

- the invited Player,
- the Academy Manager,
- the Coach assigned to run it.

This is enforced by the backend, not only by the UI. A Private Trial never appears in public listings, in the Trials board, in search results, or in announcements. No Player other than the invited one is notified of it, can discover it, or can apply to it.

---

# 30. Global Trial Visibility

A Global Trial is intended for public/eligible Player discovery.

The flow is:

```text
Academy Manager creates Global Trial
       ↓
Followers of the Academy who match age, position and gender are notified
       ↓
Eligible Players can discover it and apply
       ↓
Directly to offline Trial
```

No review of any kind is required or exists.

---

# 31. Archiving

A Trial is archived **only** when the Academy Manager archives it. Trials never archive themselves — not when every application has a verdict, not when the date has passed, not when every Player has been placed.

An archived Trial stops taking applications and leaves the public board. Everybody who already applied stays on it, with their verdicts. The Manager may reopen it.

---

# 32. State Separation

### Recommendation

```text
PENDING
ACCEPTED
REJECTED
```

```text
PENDING  = the Academy has not answered
ACCEPTED = settled by a Trial PASS
REJECTED = settled by a Trial FAIL, or turned down from the Inbox
```

### Trial application

```text
APPLIED     = the Player applied to a Global Trial
INVITED     = a Private Trial's invitation is out, awaiting the Player
CONFIRMED   = the Player accepted the invitation and is expected on the day
PASSED      = tested in person and passed (see TrialResult)
FAILED      = tested in person and failed
ACCEPTED    = the Academy offered a Squad place, after a PASS
REJECTED    = the Academy said no, or the Player declined the invitation
```

There is no `SCREENING`, `SHORTLISTED`, or `REVIEWING` state. There is no review entity.

Do not use `ACCEPTED` / `REJECTED` for Trial verdicts.

Use:

```text
PASS / FAIL
```

---

# 33. Domain Vocabulary

Use these terms consistently throughout the codebase, API, database, UI, documentation, and product.

### Trial

```text
PASS / FAIL
```

Real-life/offline football examination.

### Global Trial

Public/eligible Trial announced by an Academy Manager. Verdict by the assigned Coaches.

### Private Trial

A Trial created by inviting one Player, sent by the Academy Manager or a Coach. Verdict by the assigned Coach.

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
attribute assessment (§26.1).

### Reserve

Squad membership with **no** Group. It is where everyone lands when they join an Academy and
where they return when a Group is dissolved.

The Reserve is the _absence_ of a Group, not a Group of its own. Nobody shares a Group with a
Player in the Reserve, so nobody may assess them.

### Attribute Assessment

A Coach's ratings of a Player's speed, passing, vision, dribbling, finishing, physical,
leadership and discipline.

Not a decision, not a verdict, and never part of a Trial. Permitted only between a Coach and a
Player who share a Group (§26.1).

---

---

# 34. Final Canonical Rules

The following rules are mandatory:

### Rule 1

**Trial ALWAYS means a real-life/offline football examination.**

### Rule 2

**There is no Online Review. No Player is accepted or rejected from their profile.**

### Rule 3

**A Global Trial takes applications directly. No recommendation is required.**

### Rule 4

**Trial uses PASS / FAIL, never ACCEPT / REJECT.**

### Rule 5

**Only the Academy Manager creates a Global Trial, and assigns its Coaches.**

### Rule 6

**A Private Trial exists only as an invitation to one Player, sent by the Academy Manager or a Coach.**

### Rule 7

**A Player is physically tested at every Trial.**

### Rule 8

**Only Trial → PASS makes the Player eligible for Squad placement.**

### Rule 9

**The Academy Manager performs the actual Squad placement.**

### Rule 10

**Only a Coach assigned to the Trial records its verdict — on a Global Trial and a Private Trial alike.**

### Rule 11

**The Academy Manager never records a verdict. After a PASS, the Manager invites the Player and adds them to the Squad.**

### Rule 12

**Trial → PASS and Trial → FAIL both trigger Scout Success Rating recalculation.**

### Rule 13

**Trial → PASS clears the Player's `recommendations` array.**

### Rule 14

**An Academy turning a recommendation down triggers Scout Success Rating recalculation and clears nothing.**

### Rule 15

**Trial → FAIL does NOT clear the Player's recommendations merely because of the failure.**

### Rule 16

**Publishing a Global Trial notifies only Players who follow the Academy and match its age range, positions and gender.**

### Rule 17

**A hired Scout recommendation enters the Academy Inbox. The Manager's answer is an invitation to a Private Trial or a refusal — nothing in between.**

### Rule 18

**A Private Trial is visible only to the invited Player, the Academy Manager and the assigned Coach, and the backend enforces it.**

### Rule 19

**A Trial never archives itself. Only the Academy Manager archives a Trial.**

### Rule 20

**Do not introduce alternative interpretations of these rules without discussing them first.**

### Rule 21

**A Coach may assess a Player's attributes if and only if the Coach and the Player share a
Group inside the same Academy Squad (§26.1).**

### Rule 22

**A Trial verdict may not require, accept or write attribute ratings. The decider presses
PASS / FAIL, and nothing else.**

### Rule 23

**The Reserve is the absence of a Group. A Player in the Reserve shares a Group with nobody and
is therefore assessable by nobody.**

### Rule 24

**A Private Trial's Player reaches the assigned Coach only after accepting the invitation. Until then the Coach is not shown them, cannot record a verdict, and never sees the invitation note.**

### Rule 25

**A verdict is written at once and acted on after a short undo window. Inside the window the deciding Coach may take it back, and nothing has gone out; after it, the verdict stands.**

### Rule 26

**A trial verdict is told to the Player, and to nobody else. The Manager learns who passed from their dashboard, invites them to the Squad with one press, and is told once how the Player answered — "a player joined your squad" on a yes, or the refusal with the Player's note.**

### Rule 27

**Accepting a Squad invitation places the Player in the Reserve automatically, after a short undo window. Nobody adds a Player to a Squad by hand.**

### Rule 28

**Only an Academy Manager sees a Player's exact facts — date of birth, exact age, address — and contact details (email, phone, Telegram), and only on the Player's profile. Everybody else is shown the age band and no address.**

---

# 35. Canonical Short Version

For quick reference:

```text
CASE 1 — GLOBAL TRIAL

Academy Manager creates Global Trial, assigns Coaches
        ↓
Matching followers notified
        ↓
Player applies
        ↓
Offline Trial
        ↓
Assigned Coach PASS / FAIL
        ↓
PASS → Clear recommendations
     → Recalculate Scout Success Ratings
     → Squad candidate; Academy Manager can add Player to Squad

FAIL → Recalculate Scout Success Ratings
     → No Squad placement
```

```text
CASE 2 — ACADEMY FINDS PLAYER

Academy Manager or Coach finds Player
        ↓
Invite to Private Trial
  (Coach runs it / Manager names the Coach)
        ↓
Player accepts
        ↓
Offline Trial
        ↓
Assigned Coach PASS / FAIL

PASS → Clear recommendations
     → Recalculate Scout Success Ratings
     → Squad candidate; Academy Manager can add Player to Squad

FAIL → Recalculate Scout Success Ratings
     → No Squad placement
```

```text
CASE 3 — HIRED SCOUT

Hired Scout recommends Player
        ↓
Academy Inbox
        ↓
Academy Manager turns down → Recalculate Scout Success Ratings → End
                 or
Academy Manager invites to Private Trial (names the Coach)
        ↓
CASE 2 CONTINUES
```

This is the **canonical FotSpot domain logic**. All future implementation decisions involving these entities should be consistent with this specification.
