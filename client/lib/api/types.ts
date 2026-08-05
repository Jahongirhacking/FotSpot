/**
 * Mirrors of the backend's response shapes. Kept in sync by hand — there is no
 * shared package (root CLAUDE.md: no workspace tooling). If a backend DTO changes,
 * change it here in the same PR.
 */

export type DominantFoot = 'LEFT' | 'RIGHT' | 'BOTH';

export type PlayingStyle =
  | 'POACHER'
  | 'TARGET_MAN'
  | 'DEEP_LYING_FORWARD'
  | 'WIDE_THREAT'
  | 'BOX_TO_BOX'
  | 'PLAYMAKER'
  | 'DESTROYER'
  | 'ORCHESTRATOR'
  | 'BALL_PLAYING_DEFENDER'
  | 'STOPPER'
  | 'OVERLAPPING_FULL_BACK'
  | 'SWEEPER'
  | 'OFFENSIVE_KEEPER'
  | 'DEFENSIVE_KEEPER';

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type RecommendationStatus = 'PENDING' | 'REVIEWING' | 'ACCEPTED' | 'REJECTED';
export type TrialApplicationStatus =
  'APPLIED' | 'SHORTLISTED' | 'INVITED' | 'REJECTED' | 'ACCEPTED';
/** One value per card attribute (§21.1), plus highlights. */
export type MediaCategory =
  'PACE' | 'DRIBBLING' | 'PASSING' | 'FINISHING' | 'PHYSICAL' | 'TECHNIQUE' | 'MATCH_HIGHLIGHTS';
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
export interface Media {
  id: string;
  playerId: string;
  type: MediaType;
  category: MediaCategory;
  status: 'ACTIVE' | 'FLAGGED' | 'REMOVED';
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

export interface PlayerProfile {
  id: string;
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

export interface AcademyProfile {
  id: string;
  name: string;
  region?: string | null;
  district?: string | null;
  description?: string | null;
  status: VerificationStatus;
  members?: AcademyMemberRef[];
  createdAt: string;
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
export interface CoachReview {
  id: string;
  status: ReviewStatus;
  note: string | null;
  assignedAt: string;
  decidedAt: string | null;
  academy: { id: string; name: string };
  recommendation: {
    id: string;
    note: string | null;
    scout: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
    };
    player: NonNullable<RankedRecommendation['player']>;
  };
}

export interface Trial {
  id: string;
  academyId: string;
  title: string;
  ageRangeMin: number;
  ageRangeMax: number;
  positions: string[];
  location: string;
  date: string;
  requirements?: string | null;
  createdAt: string;
}

export interface TrialApplication {
  id: string;
  trialId: string;
  playerId: string;
  status: TrialApplicationStatus;
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
  | 'RECOMMENDATION_ACCEPTED'
  | 'RECOMMENDATION_REJECTED'
  | 'TRIAL_INVITATION'
  | 'TRIAL_RESULT'
  | 'VERIFICATION_RESULT';

export interface AppNotification {
  id: string;
  userId: string;
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
