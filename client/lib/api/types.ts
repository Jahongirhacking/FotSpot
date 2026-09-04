/**
 * Mirrors of the backend's response shapes. Kept in sync by hand — there is no
 * shared package (root CLAUDE.md: no workspace tooling). If a backend DTO changes,
 * change it here in the same PR.
 */

export type DominantFoot = 'LEFT' | 'RIGHT' | 'BOTH';

export type PlayingStyle =
  | 'GOAL_POACHER'
  | 'FOX_IN_THE_BOX'
  | 'DEEP_LYING_FORWARD'
  | 'PROLIFIC_WINGER'
  | 'CLASSIC_10'
  | 'BOX_TO_BOX'
  | 'PLAYMAKER'
  | 'ANCHOR_MAN'
  | 'ORCHESTRATOR'
  | 'DEFENSIVE_FULLBACK'
  | 'DESTROYER'
  | 'OFFENSIVE_WINGBACK'
  | 'BUILD_UP'
  | 'OFFENSIVE_KEEPER'
  | 'DEFENSIVE_KEEPER';

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type RecommendationStatus = 'PENDING' | 'REVIEWING' | 'ACCEPTED' | 'REJECTED';
/** In the order it moves — see the Prisma enum for what each one means. */
export type TrialApplicationStatus =
  | 'APPLIED'
  | 'SCREENING'
  | 'SHORTLISTED'
  | 'INVITED'
  | 'CONFIRMED'
  | 'PASSED'
  | 'FAILED'
  | 'REJECTED'
  | 'ACCEPTED';

/**
 * A coach's verdict after testing the player in person.
 *
 * Never ACCEPT/REJECT — those are the online review's words. See TRIAL.md §36.
 */
export type TrialVerdict = 'PASS' | 'FAIL';
/** One value per card attribute (§21.1), plus highlights. */
export type MediaCategory =
  | 'PACE'
  | 'DRIBBLING'
  | 'PASSING'
  | 'FINISHING'
  | 'PHYSICAL'
  | 'TECHNIQUE'
  | 'MATCH_HIGHLIGHTS'
  | 'GOALKEEPING';
export type MediaType = 'IMAGE' | 'VIDEO';
export type FollowTargetType = 'PLAYER' | 'ACADEMY';
export type AcademyScoutFollowState = 'FOLLOWING' | 'MUTED';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

/**
 * Clip metadata, with permanent URLs.
 *
 * Clips are public and stay reachable until the player deletes them, so the URL
 * is stable, cacheable and safe to hand straight to a `<video>`. The storage key
 * is still absent — it is an internal address, and callers that hold keys start
 * building URLs themselves, which is what stops CDN changes being config changes.
 */
/**
 * `BLOCKED` rather than the `block` in the product spec: it is a state a clip is
 * in, and the backend enum spells every status that way (see MediaStatus above).
 */
export type MediaModerationStatus = 'UNVERIFIED' | 'VERIFIED' | 'BLOCKED';

export interface Media {
  id: string;
  playerId: string;
  type: MediaType;
  category: MediaCategory;
  /**
   * A clip starts PROCESSING and is promoted by the media worker once it has
   * found the object in the bucket; FAILED means it never arrived. Only the
   * owner is served anything but ACTIVE — see MediaService.listForPlayer.
   */
  status: 'PROCESSING' | 'ACTIVE' | 'FAILED' | 'FLAGGED' | 'REMOVED';
  /**
   * Why the worker gave up, in the uploader's words. Set only with `FAILED`;
   * the API spreads the whole row, so it was always sent and never declared.
   */
  failureReason?: string | null;
  /**
   * How many times processing was restarted — by the stale sweep or an admin —
   * before the worker answered. Bounded server-side; three means it gave up.
   */
  processingAttempts?: number;
  /** When the worker last answered, whichever way. Null while PROCESSING. */
  processedAt?: string | null;
  /**
   * When the footage was taken, as the player said at upload — not the upload
   * itself, which is `createdAt`. Optional so an older cached response parses.
   */
  recordedAt?: string;
  /**
   * Whether an admin has watched this clip yet — the gate on public visibility.
   *
   * A second axis, not a replacement for `status`: `status` says whether the
   * upload reached the bucket, this says whether anyone is allowed to see it, and
   * a clip is routinely PROCESSING *and* UNVERIFIED. Public means both — ACTIVE
   * and VERIFIED — and the backend enforces the pair on every query, so anything
   * other than VERIFIED reaching this client means the viewer is the clip's own
   * uploader or an admin working the moderation queue.
   *
   * Optional so an older cached response still parses.
   */
  moderationStatus?: MediaModerationStatus;
  title?: string | null;
  description?: string | null;
  /** The 0–100 rating this clip evidences. Null for highlights. */
  rating?: number | null;
  /**
   * Who put `rating` there. A player's number is a claim; a coach watching the
   * same clip can replace it, and then it is evidence (§1.6).
   */
  reportedBy?: 'SELF' | 'COACH';
  /**
   * Permanent URL of the video. Null only when the server has no public storage
   * origin configured (`R2_PUBLIC_BASE_URL`) — the clip exists, it just has no
   * address yet.
   */
  url: string | null;
  /** Permanent URL of the cover frame; null when capture failed at upload. */
  posterUrl?: string | null;
  createdAt: string;
}

/**
 * One clip in the ranked feed: the media, who it belongs to, and where the viewer
 * already stands with it. All three come from one request — a feed that fetched
 * engagement per tile would be an N+1 in the most-scrolled screen in the product.
 */
export interface FeedClip extends Omit<Media, 'playerId' | 'status'> {
  likes: number;
  views: number;
  likedByMe: boolean;
  /** Whether the viewer follows this player — the feed's extra ranking weight. */
  following: boolean;
  player: {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    primaryPosition: string | null;
    region: string | null;
    avatarUrl: string | null;
  };
}

export interface FeedPage {
  items: FeedClip[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * One card in the admin moderation queue: the clip, plus enough of the player to
 * judge it without opening a second screen.
 *
 * A moderator deciding whether a video is what it claims to be needs to know it
 * is a fourteen-year-old's PACE clip — and a queue that fetched the player per
 * card would be a request per decision on a screen that has to stay fast.
 */
/** The worker's axis, and `ALL` for the admin list's filter. */
export type MediaStatus = Media['status'];
export type MediaStatusFilter = 'ALL' | MediaStatus;

/**
 * What the queue says about a clip still PROCESSING.
 *
 * `live` is the one bit that matters: whether anything is still going to
 * write a verdict on the row. A job that is waiting, delayed or active will;
 * one that is finished, failed or missing will not, and a row still
 * PROCESSING behind it is stuck. The rest is detail for the admin card.
 */
export interface ProcessingJobInfo {
  state: string;
  live: boolean;
  attemptsMade: number | null;
  failedReason: string | null;
}

export interface PendingClip extends Omit<Media, 'playerId'> {
  /** Present only on PROCESSING clips from the status list. */
  processing?: ProcessingJobInfo;
  player: {
    id: string;
    userId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    birthDate: string;
    primaryPosition: string | null;
    region: string | null;
    district: string | null;
    avatarUrl: string | null;
  };
}

export interface SuggestedPlayer {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  primaryPosition: string | null;
  region: string | null;
  avatarUrl: string | null;
  globalWeight: number;
  recommendationCount: number;
}

/** The block behind the avatar menu — see backend UsersService.summary. */
export interface ProfileSummary {
  followers: number;
  following: number;
  player: { profileId: string; coach: SummaryCoach | null } | null;
  coach: { profileId: string; status: string; assessedPlayers: number } | null;
  academy: {
    id: string;
    name: string;
    region: string | null;
    district: string | null;
    status: string;
    myRole: AcademyMemberRole;
    coaches: number;
    players: number;
    scouts: number;
  } | null;
}

export interface SummaryCoach {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  lastAssessedAt: string;
}

export type AcademyMemberRole = 'MANAGER' | 'COACH' | 'SCOUT' | 'PLAYER';
export type AcademyMemberStatus = 'ACTIVE' | 'INACTIVE' | 'RELEASED';

/** One person on an academy's books. `rating` is the mean assessed attribute. */
export interface AcademyMember {
  id: string;
  role: AcademyMemberRole;
  status: AcademyMemberStatus;
  joinedAt: string;
  releasedAt: string | null;
  previousAcademyId: string | null;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  avatarUrl: string | null;
  playerId: string | null;
  primaryPosition: string | null;
  birthDate: string | null;
  coachStatus: string | null;
  rating: number | null;
  /** What kind of coach they are here — head coach, GK coach. Null for others. */
  coachType: string | null;
  /** The squad they are in, or null for the reserve. */
  group: { id: string; name: string } | null;
  /** A scout's standing (§1.5). Null for anyone who is not one. */
  level: number | null;
  successRate: number | null;
}

export interface TransferListing {
  id: string;
  role: AcademyMemberRole;
  releasedAt: string | null;
  academy: { id: string; name: string; region: string | null };
  userId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  avatarUrl: string | null;
  playerId: string | null;
  primaryPosition: string | null;
  rating: number | null;
}

/** What a clip's rating was before someone changed it. */
export interface RatingRevision {
  id: string;
  mediaId: string;
  previousRating: number | null;
  previousReportedBy: 'SELF' | 'COACH';
  rating: number;
  reportedBy: 'SELF' | 'COACH';
  actorUserId: string;
  createdAt: string;
}

/** A named squad inside an academy. Reserve is the absence of one. */
export interface AcademyGroup {
  id: string;
  academyId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroupDetail extends Omit<AcademyGroup, 'memberCount'> {
  academy: { id: string; name: string };
  members: {
    id: string;
    role: AcademyMemberRole;
    status: AcademyMemberStatus;
    userId: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    avatarUrl: string | null;
    playerId: string | null;
    primaryPosition: string | null;
    birthDate: string | null;
    coachType: string | null;
  }[];
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

/** An academy asking somebody to join it, and their answer. */
export interface AcademyInvitation {
  id: string;
  academyId: string;
  userId: string;
  role: AcademyMemberRole;
  status: InvitationStatus;
  note: string | null;
  invitedByUserId: string;
  createdAt: string;
  decidedAt: string | null;
}

/** The invitee's view — they need to know which academy is asking. */
export interface MyInvitation extends AcademyInvitation {
  academy: {
    id: string;
    name: string;
    region: string | null;
    district: string | null;
    status: VerificationStatus;
    /** Academy or local team — the two are different things to be invited by. */
    kind: AcademyKind;
  };
}

export type TransferStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** One academy offering a member to another, and the other's answer. */
export interface MemberTransfer {
  id: string;
  status: TransferStatus;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  fromAcademy: { id: string; name: string };
  toAcademy: { id: string; name: string };
  member: {
    id: string;
    role: AcademyMemberRole;
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      username: string | null;
      playerProfile: { id: string; primaryPosition: string | null } | null;
    };
  };
}

/**
 * One membership, current or ended, as the API reports it.
 *
 * `kind` and `status` come from the server rather than being inferred here —
 * whether a squad counts as a verified academy is the backend's rule, and a
 * screen that decided it locally would be a second copy of that rule.
 */
export interface SquadMembership {
  academyId: string;
  academyName: string;
  kind: AcademyKind;
  status: VerificationStatus;
  /** Null means the academy's reserve rather than a named group. */
  groupId: string | null;
  groupName: string | null;
  joinedAt: string;
  /** Null while the membership is current. */
  leftAt: string | null;
}

/**
 * Where a player plays, and where they used to.
 *
 * Three fields because they answer three questions the product treats
 * differently: one academy at a time, any number of local teams at once, and a
 * history that is never rewritten. A single list would flatten all three.
 */
export interface PlayerMemberships {
  /** The one current academy, or null when they are with none. */
  academy: SquadMembership | null;
  /** Every local team they currently play for. */
  localTeams: SquadMembership[];
  /** Academies they have left. Never contains the current one. */
  academyHistory: SquadMembership[];
}

export interface PlayerProfile {
  id: string;
  /** Absent on responses that predate the field; never null once present. */
  memberships?: PlayerMemberships;
  /**
   * 0–5 for the card's star row, computed by the server
   * (`backend/src/players/card-stars.util.ts`).
   *
   * On the player rather than derived per card: every screen that draws one was
   * otherwise fetching that player's assessments to recompute the same five
   * stars, which is a request per card on a screen that shows twenty.
   */
  stars?: number;
  userId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  height?: number | null;
  weight?: number | null;
  dominantFoot?: DominantFoot | null;
  primaryPosition?: string | null;
  secondaryPosition?: string | null;
  playingStyle?: PlayingStyle | null;
  /** Flattened from the owning User by the API — one account, one picture. */
  avatarUrl?: string | null;
  /** Public handle, shown and linked as `@handle`. */
  username?: string | null;
  region?: string | null;
  district?: string | null;
  matches: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  sprintTime?: number | null;
  jugglingRecord?: number | null;
  media?: Media[];
  createdAt: string;
}

/**
 * Academy or local team. Set once at creation; see the Prisma enum's note.
 * Never rendered raw — `LOCAL_TEAM` reads as "Local Team / Mahalliy Jamoa".
 */
export type AcademyKind = 'ACADEMY' | 'LOCAL_TEAM';

export interface AcademyProfile {
  /**
   * Public handle, resolving `/academies/@handle`. Stored without the `@`.
   *
   * Null until the manager chooses one — an academy is reached by id until then.
   */
  username?: string | null;

  /**
   * Search terms for this page's metadata. **Never rendered as page content.**
   *
   * Set by a super admin on an academy and by the hosting manager on a trial;
   * the API refuses the field from anyone else. Read by `generateMetadata`,
   * which escapes on output — nothing here is inserted into HTML by hand.
   */
  seoKeywords?: string[];

  id: string;
  name: string;
  kind: AcademyKind;
  region?: string | null;
  district?: string | null;
  description?: string | null;
  /** Sanitised HTML this academy starts every trial note from. */
  defaultTrialNote?: string | null;
  status: VerificationStatus;

  /** Where it is, as a point. Null together — one coordinate locates nothing. */
  latitude?: number | null;
  longitude?: number | null;

  /** Built from `logoKey` server-side; the key itself never leaves the API. */
  logoUrl?: string | null;

  /** Host-validated on write — the icon has to go where it claims. */
  telegramUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;

  /**
   * How to ring the academy. E.164, and `''` on write clears one.
   * Not the manager's personal number — see the schema note on the model.
   */
  primaryPhone?: string | null;
  backupPhone?: string | null;

  members?: AcademyMemberRef[];
  createdAt: string;
}

/** One photo in an academy's gallery. The lowest `sortOrder` is the cover. */
export interface AcademyPhoto {
  id: string;
  academyId: string;
  caption?: string | null;
  sortOrder: number;
  url: string | null;
  createdAt: string;
}

/** Somebody the academy chose to show off, in the order it chose. */
export interface AcademyFeatured {
  role: AcademyMemberRole;
  rank: number;
  memberId: string;
  userId: string | null;
  /**
   * The player card this person has, if any — `/players/:profileId`.
   *
   * Null for a coach or a scout, and for a member listed as PLAYER who has not
   * built a card yet. A player's profile id is not their account id, which is
   * why the API sends both.
   */
  profileId: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

/** The trimmed membership embedded in an academy profile. */
export interface AcademyMemberRef {
  id: string;
  academyId: string;
  userId: string;
  coachId?: string | null;
  role: AcademyMemberRole;
  createdAt: string;
}

export interface CoachProfile {
  id: string;
  userId: string;
  bio?: string | null;
  status: VerificationStatus;
  createdAt: string;
}

export interface ScoutStats {
  /**
   * Recommendations this scout has actually filed.
   *
   * Separate from `totalRecommendations`, which counts *target rows* because that
   * is the denominator §1.5's success rate is defined on — a GLOBAL
   * recommendation has no targets until an academy takes it up. Correct for
   * reputation, wrong for a card labelled "sent", which is why both exist.
   */
  sentRecommendations?: number;
  userId: string;
  totalRecommendations: number;
  acceptedRecommendations: number;
  successRate: number;
  level: number;
  weight: number;
}

export interface Recommendation {
  id: string;
  scoutId: string;
  playerId: string;
  /** Joined on the academy inbox, so the screen never renders a bare id. */
  player?: { id: string; firstName: string; lastName: string; birthDate: string } | null;
  scout?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  } | null;
  /** Null for GLOBAL recommendations, which address no single academy (§1.5.3). */
  academyId: string | null;
  status: RecommendationStatus;
  note?: string | null;
  createdAt: string;
}

/** GET /recommendations/mine — resolved names, and both addressing modes. */
export interface MyRecommendation {
  id: string;
  type: 'GLOBAL' | 'SPECIFIC';
  status: RecommendationStatus;
  note?: string | null;
  createdAt: string;
  player: { id: string; firstName: string; lastName: string };
  /** Empty for GLOBAL — it is offered to every academy rather than addressed. */
  academies: { id: string; name: string; status: RecommendationStatus }[];
  /** When a coach turned it down, if one did. */
  rejectedAt?: string | null;
  /** Set while the three-month cooldown is running; null once it has passed. */
  canRecommendAgainAt?: string | null;
  canRecommendAgain?: boolean;
}

/** GET /recommendations/academy/:id/ranked — README §1.5.1/§1.5.2. */
export interface RankedRecommendation {
  playerId: string;
  /** Joined by the API so the inbox never has to resolve names itself. */
  player: {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    primaryPosition: string | null;
    region: string | null;
  } | null;
  recommendationIds: string[];
  recommendationCount: number;
  credibility: number;
  /** Where this player stands in the coach review — null before anyone is asked. */
  review: InboxReview | null;
}

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface InboxReview {
  id: string;
  recommendationId: string;
  status: ReviewStatus;
  note: string | null;
  decidedAt: string | null;
  coach: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
}

/** A settled recommendation: invited, or turned down. */
export interface AcademyHistoryRow {
  /**
   * The private trial this player was invited to, if one exists.
   *
   * An invitation is what takes a player out of the queue even though the
   * recommendation is not settled — the trial answers that later — so it is the
   * history row's own field rather than something derived from `status`.
   */
  invitation: {
    applicationId: string;
    status: TrialApplicationStatus;
    trialId: string;
    trialTitle: string;
    date: string;
  } | null;
  recommendationId: string;
  status: 'ACCEPTED' | 'REJECTED';
  decidedAt: string;
  player: RankedRecommendation['player'];
  scout: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
  note: string | null;
  review: {
    status: ReviewStatus;
    note: string | null;
    coach: { id: string; firstName: string | null; lastName: string | null };
  } | null;
}

/** One player waiting on this coach's verdict. */
/**
 * One page of anything the API paginates — `{ items, total, page, pageSize }`.
 *
 * The shape backend/CLAUDE.md §5 mandates for every paginated read, named once
 * so a caller writes `Paged<CoachReview>` rather than restating the envelope.
 */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * A player a coach still owes a verdict, with the session they owe it on.
 *
 * Carries the trial because the coach's queue mixes both kinds deliberately —
 * it is a list of jobs, not a catalogue — and the card has to say which flow
 * each one is.
 */
export interface PendingTrialApplicant {
  id: string;
  status: TrialApplicationStatus;
  createdAt: string;
  trial: {
    id: string;
    title: string;
    type: TrialType;
    date: string | null;
    endDate: string | null;
    startTime: string | null;
    endTime: string | null;
    location: string;
  };
  player: PlayerProfile & { avatarUrl?: string | null };
}

export interface CoachReview {
  id: string;
  status: ReviewStatus;
  note: string | null;
  assignedAt: string;
  decidedAt: string | null;
  academy: { id: string; name: string };
  /**
   * Who is being judged. The only person on this shape.
   *
   * There is deliberately no scout and no recommendation: a coach is never told
   * who put the player forward — see `RecommendationsService.listMyReviews` for
   * why that would put a thumb on the scale.
   */
  player: NonNullable<RankedRecommendation['player']> & {
    avatarUrl?: string | null;
    secondaryPosition?: string | null;
    dominantFoot?: DominantFoot | null;
  };
}

export type TrialStatus = 'OPEN' | 'ARCHIVED';

/** GENERAL is the open board; PRIVATE is by invitation and never listed. */
export type TrialType = 'GENERAL' | 'PRIVATE';

/**
 * Just enough of the academy to show who is running a trial and where they are.
 *
 * `latitude`/`longitude` are nullable together — half a pair points at the Gulf
 * of Guinea — and are only ever read through `yandexMapsUrl`, which checks both.
 */
/** What the trials board can be narrowed and ordered by — see `ListTrialsQueryDto`. */
export interface TrialListFilters {
  region?: string;
  district?: string;
  age?: number | string;
  position?: string;
  sort?: 'newest' | 'recommended';
}

export interface TrialAcademy {
  id: string;
  name: string;
  region: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  logoUrl: string | null;
}

export interface Trial {
  id: string;
  academyId: string;
  title: string;
  /**
   * Who may apply. Null on a private trial, which is open to nobody — it exists
   * for one named child who was already chosen.
   */
  ageRangeMin: number | null;
  ageRangeMax: number | null;
  positions: string[];
  location: string;
  /**
   * When the trial window opens. **Null on an open-ended trial**, which runs
   * until the academy archives it.
   *
   * Render through `lib/trial-window.ts`, never `formatDate` directly:
   * `new Date(null)` is the epoch, so a direct call prints "1 Jan 1970".
   */
  date: string | null;
  /** When the window closes. Null on a single-day or open-ended trial. */
  endDate?: string | null;
  /** The daily window, `HH:mm` wall clock — applies to each day. */
  startTime?: string | null;
  endTime?: string | null;
  /** Who the trial is for. */
  /** `general` is trial-only — a session can be open to everybody. */
  gender?: 'male' | 'female' | 'general';
  /** R2 key for the cover image; `coverUrl` is what to render. */
  coverKey?: string | null;
  coverUrl?: string | null;
  /**
   * The academy running it, folded into the trial by the API.
   *
   * Absent on the responses to creating and updating a trial, which return the
   * row they just wrote — the screens that need the host are the ones that read
   * a trial, and those include it.
   */
  /**
   * Search terms for this page's metadata. **Never rendered as page content.**
   *
   * Set by a super admin on an academy and by the hosting manager on a trial;
   * the API refuses the field from anyone else. Read by `generateMetadata`,
   * which escapes on output — nothing here is inserted into HTML by hand.
   */
  seoKeywords?: string[];
  academy?: TrialAcademy;
  /**
   * Last moment somebody may apply. Null only on trials written before
   * deadlines existed; those stay open until their exam date.
   */
  applyDeadline?: string | null;
  requirements?: string | null;
  /** What the player reads, as sanitised HTML. Render through `<TrialNote>`. */
  note?: string | null;
  /** ARCHIVED keeps the applicants and refuses new ones. There is no delete. */
  status: TrialStatus;
  type: TrialType;
  createdAt: string;
  updatedAt: string;
}

/**
 * A trial as its coach sees it, with the size of the job attached.
 *
 * `awaitingVerdict` is the number that matters: a trial nobody is still waiting
 * on is finished however recent it is, and one with players outstanding is work
 * however long ago the date was.
 */
/** This coach's own review of one player — see RecommendationsService.myReviewFor. */
export interface MyCoachReview {
  id: string;
  status: ReviewStatus;
  note: string | null;
  assignedAt: string;
  decidedAt: string | null;
  academy: { id: string; name: string };
}

export interface CoachTrial extends Trial {
  applicantCount: number;
  awaitingVerdict: number;
}

export interface TrialApplication {
  id: string;
  trialId: string;
  playerId: string;
  status: TrialApplicationStatus;
  /** What the academy wrote when inviting — private trials only. */
  inviteNote?: string | null;
  /**
   * The *online* screening, when the row came from a screen that includes it.
   *
   * Private trials only — a general trial is never screened online (Rule 5).
   */
  review?: {
    id: string;
    status: ReviewStatus;
    note: string | null;
    decidedAt: string | null;
    coachUser: { id: string; firstName: string | null; lastName: string | null };
  } | null;
  /** What the coach said after testing them in person. Both trial types. */
  result?: {
    id: string;
    verdict: TrialVerdict;
    note: string | null;
    decidedAt: string;
    coachUser: { id: string; firstName: string | null; lastName: string | null };
  } | null;
  /** Joined on the player's own list so they can read what they were invited to. */
  trial?: Trial;
  createdAt: string;
}

export interface CoachAssessment {
  id: string;
  coachUserId: string;
  playerId: string;
  speed: number;
  passing: number;
  vision: number;
  dribbling: number;
  finishing: number;
  physical: number;
  leadership: number;
  discipline: number;
  notes?: string | null;
  createdAt: string;
}

export type NotificationEvent =
  | 'REVIEW_ASSIGNED'
  | 'REVIEW_DECIDED'
  | 'ACADEMY_INVITATION'
  | 'ACADEMY_JOIN_INVITATION'
  | 'ACADEMY_JOIN_ANSWER'
  | 'RECOMMENDATION_ACCEPTED'
  | 'RECOMMENDATION_REJECTED'
  | 'TRIAL_INVITATION'
  | 'TRIAL_RESCHEDULED'
  | 'TRIAL_RESULT'
  | 'SQUAD_PLACEMENT'
  | 'SQUAD_JOINED'
  | 'SQUAD_LEFT'
  | 'VERIFICATION_RESULT';

export interface AppNotification {
  id: string;
  userId: string;
  /**
   * Who caused this, and in what capacity. Null for events nobody triggered.
   *
   * `actorRole` is what the actor was *acting as*, not everything they are: a
   * scout who is also a coach rejecting a player did it as a coach.
   */
  actor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    avatarUrl: string | null;
  } | null;
  actorRole: string | null;
  event: NotificationEvent;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface DeviceSession {
  id: string;
  deviceId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  lastUsedAt: string;
  createdAt: string;
  expiresAt: string;
}

export interface Follow {
  id: string;
  followerId: string;
  targetType: FollowTargetType;
  targetId: string;
  createdAt: string;
  /**
   * Resolved server-side from the target, because a `Follow` row stores only a
   * type and an id — a list built from the rows alone can show nothing but a
   * uuid. Null when the target has since been deleted, which keeps the row in
   * place rather than making the list shorter than the count beside it.
   */
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
}

/**
 * Somebody following you: a person following your player card, or an academy
 * following you as a scout. One list, because it is one question — and because
 * the counter above it already adds the two together.
 */
export interface FollowerEntry {
  id: string;
  kind: 'USER' | 'ACADEMY';
  createdAt: string;
  userId?: string | null;
  /** Their player card, when they have one — `/players/:profileId`. */
  profileId?: string | null;
  academyId?: string | null;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export interface AcademyScoutFollow {
  /** Joined on the academy's own network listing, so no row renders a bare id. */
  scout?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  } | null;
  id: string;
  academyId: string;
  scoutId: string;
  state: AcademyScoutFollowState;
  createdAt: string;
}
