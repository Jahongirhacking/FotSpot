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
  | 'PACE'
  | 'DRIBBLING'
  | 'PASSING'
  | 'FINISHING'
  | 'PHYSICAL'
  | 'TECHNIQUE'
  | 'MATCH_HIGHLIGHTS';
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

export interface Media {
  id: string;
  playerId: string;
  type: MediaType;
  category: MediaCategory;
  url: string;
  storageKey: string;
  status: 'ACTIVE' | 'FLAGGED' | 'REMOVED';
  title?: string | null;
  description?: string | null;
  /** The player's own 0–100 claim this clip evidences. Null for highlights. */
  selfRating?: number | null;
  createdAt: string;
}

export interface PlayerProfile {
  id: string;
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
  members?: AcademyMember[];
  createdAt: string;
}

export interface AcademyMember {
  id: string;
  academyId: string;
  userId: string;
  coachId?: string | null;
  role: 'MANAGER' | 'COACH' | 'SCOUT';
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
  academyId: string;
  status: RecommendationStatus;
  note?: string | null;
  createdAt: string;
}

/** GET /recommendations/academy/:id/ranked — README §1.5.1/§1.5.2. */
export interface RankedRecommendation {
  playerId: string;
  recommendationIds: string[];
  recommendationCount: number;
  credibility: number;
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
  id: string;
  academyId: string;
  scoutId: string;
  state: AcademyScoutFollowState;
  createdAt: string;
}
