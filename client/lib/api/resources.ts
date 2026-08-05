/**
 * Typed wrappers, one group per backend controller (client/CLAUDE.md §6).
 * Route strings mirror the NestJS controllers 1:1 — if a route moves, it moves here.
 */
import { apiFetch, toQuery, type Page, type RequestOptions } from './client';
import type {
  AcademyProfile,
  AcademyScoutFollow,
  AcademyScoutFollowState,
  AppNotification,
  CoachAssessment,
  CoachProfile,
  DeviceSession,
  Follow,
  FollowTargetType,
  AcademyMember,
  AcademyMemberRole,
  AcademyMemberStatus,
  FeedPage,
  Media,
  MediaCategory,
  MediaType,
  PlayerProfile,
  PlayingStyle,
  RankedRecommendation,
  MyRecommendation,
  Recommendation,
  RecommendationStatus,
  ScoutStats,
  Trial,
  TrialApplication,
  TrialApplicationStatus,
  ProfileSummary,
  AcademyHistoryRow,
  CoachReview,
  SuggestedPlayer,
  TransferListing,
} from './types';

type Opts = Pick<RequestOptions, 'token' | 'activeRole' | 'revalidate' | 'tags' | 'cache'>;

// ---------- Users ----------

export const users = {
  me: (opts: Opts = {}) => apiFetch<MeResponse>('/users/me', opts),

  /** Identity + roles + per-role counters for the profile screen, in one request. */
  myProfile: (opts: Opts = {}) => apiFetch<MyProfileResponse>('/users/me/profile', opts),

  /** The short block behind the avatar menu: counts, academy, coach. */
  summary: (opts: Opts = {}) => apiFetch<ProfileSummary>('/users/me/summary', opts),

  updateProfile: (body: UpdateProfileBody, opts: Opts = {}) =>
    apiFetch<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
    }>('/users/me', { method: 'PATCH', body, ...opts }),

  avatarUploadUrl: (body: { filename: string }, opts: Opts = {}) =>
    apiFetch<AvatarUploadUrl>('/users/me/avatar/upload-url', { method: 'POST', body, ...opts }),

  /** Step 1 of a phone/email change: prove control of the new destination. */
  requestContactChange: (body: ContactChangeRequest, opts: Opts = {}) =>
    apiFetch<ContactChangeTicket>('/users/me/contact/request', { method: 'POST', body, ...opts }),

  verifyContactChange: (body: ContactChangeRequest & { code: string }, opts: Opts = {}) =>
    apiFetch<{ id: string; email: string | null; phone: string | null }>(
      '/users/me/contact/verify',
      { method: 'POST', body, ...opts },
    ),

  /**
   * Become a scout — the one role a user may grant themselves, because it starts
   * with no authority (§1.5: a new scout's word carries the lowest weight).
   */
  becomeScout: (opts: Opts = {}) =>
    apiFetch<{ roles: string[]; permissions: string[] }>('/users/me/roles/scout', {
      method: 'POST',
      ...opts,
    }),
};

export interface UpdateProfileBody {
  firstName?: string;
  lastName?: string;
  /** Public handle. Sent without the `@`; uniqueness is the API's answer to give. */
  username?: string;
  avatarStorageKey?: string;
  /** Hide the account from search, listings and public profile reads. */
  isPrivate?: boolean;
}

export interface AvatarUploadUrl {
  uploadUrl: string;
  storageKey: string;
  publicUrl: string;
  expiresIn: number;
}

export type ContactChannel = 'PHONE' | 'EMAIL';

export interface ContactChangeRequest {
  channel: ContactChannel;
  destination: string;
}

export interface ContactChangeTicket {
  sent: boolean;
  deliveryConfigured: boolean;
  expiresInSeconds: number;
  /** Non-production only: SMS/email delivery is a documented stub. */
  devCode?: string;
}

export interface MeResponse {
  id: string;
  email?: string | null;
  phone?: string | null;
  /** Set only on accounts an admin created — academy managers (§1.10). */
  username?: string | null;
  /** True while the account still holds its admin-generated password. */
  mustChangePassword?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  /** Hidden from search, listings and public profile reads. */
  isPrivate?: boolean;
  createdAt: string;
  roles: string[];
  permissions: string[];
}

export interface MyProfileResponse extends MeResponse {
  stats: {
    player: {
      profileId: string;
      birthDate: string;
      primaryPosition: string | null;
      secondaryPosition: string | null;
      dominantFoot: 'LEFT' | 'RIGHT' | 'BOTH' | null;
      playingStyle: string | null;
      region: string | null;
      district: string | null;
      height: number | null;
      weight: number | null;
      mediaCount: number;
      trialApplications: number;
      recommendationsReceived: number;
    } | null;
    coach: { profileId: string; status: string; assessments: number } | null;
    scout: {
      totalRecommendations: number;
      acceptedRecommendations: number;
      successRate: number;
      level: number;
      weight: number;
      followerAcademies: number;
    } | null;
    academies: { academyId: string; name: string; status: string; role: string }[];
    following: number;
  };
}

// ---------- Players ----------

export interface PlayerSearchParams {
  region?: string;
  position?: string;
  playingStyle?: PlayingStyle;
  query?: string;
  page?: number;
  pageSize?: number;
}

export const players = {
  search: (params: PlayerSearchParams = {}, opts: Opts = {}) =>
    apiFetch<Page<PlayerProfile>>(`/players/search${toQuery({ ...params })}`, opts),

  getById: (id: string, opts: Opts = {}) => apiFetch<PlayerProfile>(`/players/${id}`, opts),

  /** Resolves `/players/@handle`. The `@` is stripped before the request. */
  getByUsername: (username: string, opts: Opts = {}) =>
    apiFetch<PlayerProfile>(
      `/players/by-username/${encodeURIComponent(username.replace(/^@+/, ''))}`,
      opts,
    ),

  getMine: (opts: Opts = {}) => apiFetch<PlayerProfile>('/players/me', opts),

  createProfile: (body: CreatePlayerProfileBody, opts: Opts = {}) =>
    apiFetch<PlayerProfile>('/players/me', { method: 'POST', body, ...opts }),

  updateProfile: (body: UpdatePlayerProfileBody, opts: Opts = {}) =>
    apiFetch<PlayerProfile>('/players/me', { method: 'PATCH', body, ...opts }),

  updateStats: (body: UpdatePlayerStatsBody, opts: Opts = {}) =>
    apiFetch<PlayerProfile>('/players/me/stats', { method: 'PATCH', body, ...opts }),
};

export interface CreatePlayerProfileBody {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  height?: number;
  weight?: number;
  dominantFoot?: 'LEFT' | 'RIGHT' | 'BOTH';
  primaryPosition?: string;
  secondaryPosition?: string;
  playingStyle?: PlayingStyle;
  region?: string;
  district?: string;
}

export type UpdatePlayerProfileBody = Partial<
  Omit<CreatePlayerProfileBody, 'firstName' | 'lastName' | 'birthDate' | 'gender'>
>;

export interface UpdatePlayerStatsBody {
  matches?: number;
  goals?: number;
  assists?: number;
  cleanSheets?: number;
  sprintTime?: number;
  jugglingRecord?: number;
}

// ---------- Academies ----------

export const academies = {
  listPublic: (region?: string, opts: Opts = {}) =>
    apiFetch<AcademyProfile[]>(`/academies${toQuery({ region })}`, opts),

  getById: (id: string, opts: Opts = {}) => apiFetch<AcademyProfile>(`/academies/${id}`, opts),

  register: (
    body: { name: string; region?: string; district?: string; description?: string },
    opts: Opts = {},
  ) => apiFetch<AcademyProfile>('/academies', { method: 'POST', body, ...opts }),

  listStaff: (id: string, opts: Opts = {}) =>
    apiFetch<AcademyProfile['members']>(`/academies/${id}/staff`, opts),

  /** The academy the caller manages, or null. One manager, one academy. */
  mine: (opts: Opts = {}) => apiFetch<AcademyProfile | null>('/academies/mine', opts),

  /**
   * What the caller is to this academy — manager, staff, endorsed, or a player it
   * accepted at a trial. A separate call because `getById` is public and cached.
   */
  relation: (id: string, opts: Opts = {}) =>
    apiFetch<{ relation: AcademyRelation | null }>(`/academies/${id}/relation`, opts),
};

/** GET /media/recent — a clip with the player it belongs to. */
export interface RecentClip extends Media {
  player: {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    primaryPosition: string | null;
    region: string | null;
  };
}

export type AcademyRelation =
  'MANAGER' | 'COACH' | 'SCOUT' | 'ENDORSED_SCOUT' | 'ENDORSED_COACH' | 'TRIALIST';

// ---------- Insights (recruiting-side only — never shown to players) ----------

export interface WeeklyPlayer {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  primaryPosition: string | null;
  playingStyle: string | null;
  region: string | null;
  avatarUrl: string | null;
  /** How many scouts put this player forward — a count of backing, not a rating. */
  backingCount: number;
  backingWeight: number;
}

export interface WeeklyScout {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  acceptedThisWeek: number;
  level: number;
  successRate: number;
}

export interface WeeklyCoach {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  assessmentsThisWeek: number;
}

export interface WeeklyInsights {
  since: string;
  players: WeeklyPlayer[];
  scouts: WeeklyScout[];
  coaches: WeeklyCoach[];
}

export interface AcademySummary {
  pendingRecommendations: number;
  newThisWeek: number;
  endorsedScouts: number;
  endorsedCoaches: number;
  openTrials: number;
  applications: number;
}

export const insights = {
  weekly: (opts: Opts = {}) => apiFetch<WeeklyInsights>('/insights/weekly', opts),

  forAcademy: (academyId: string, opts: Opts = {}) =>
    apiFetch<AcademySummary>(`/insights/academy/${academyId}`, opts),
};

// ---------- Admin console ----------

export interface AdminUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email?: string | null;
  phone?: string | null;
  /** Present only on admin-created accounts — their only identifier. */
  username?: string | null;
  avatarUrl: string | null;
  createdAt: string;
  roles: string[];
  /** False for super admins — the bootstrap account must stay reachable. */
  revocable?: boolean;
}

export const admin = {
  listAdmins: (opts: Opts = {}) => apiFetch<AdminUser[]>('/admin/admins', opts),

  /** Admin-gated user lookup, so promoting someone doesn't mean pasting a UUID. */
  searchUsers: (query: string, opts: Opts = {}) =>
    apiFetch<Page<AdminUser>>(`/admin/users${toQuery({ query, pageSize: 10 })}`, opts),

  grantAdmin: (userId: string, opts: Opts = {}) =>
    apiFetch<{ assigned: boolean }>('/admin/admins', { method: 'POST', body: { userId }, ...opts }),

  revokeAdmin: (userId: string, opts: Opts = {}) =>
    apiFetch<{ revoked: boolean }>(`/admin/admins/${userId}/revoke`, { method: 'PATCH', ...opts }),

  /** Every academy, including pending and archived. */
  listAllAcademies: (opts: Opts = {}) =>
    apiFetch<(AcademyProfile & { members: { userId: string }[] })[]>('/academies/admin/all', opts),

  archiveAcademy: (academyId: string, opts: Opts = {}) =>
    apiFetch<AcademyProfile>(`/academies/${academyId}`, { method: 'DELETE', ...opts }),

  updateAcademy: (academyId: string, body: Partial<AcademyInput>, opts: Opts = {}) =>
    apiFetch<AcademyProfile>(`/academies/${academyId}`, { method: 'PATCH', body, ...opts }),

  createAcademy: (body: AcademyInput, opts: Opts = {}) =>
    apiFetch<AcademyProfile & { credentials: ManagerCredentials | null }>('/academies', {
      method: 'POST',
      body,
      ...opts,
    }),

  /** Assigns or replaces the academy's single manager. */
  setAcademyManager: (
    academyId: string,
    body: { managerUserId?: string; newManager?: NewManagerInput },
    opts: Opts = {},
  ) =>
    apiFetch<{ member: { userId: string }; credentials: ManagerCredentials | null }>(
      `/academies/${academyId}/manager`,
      { method: 'PATCH', body, ...opts },
    ),

  /** The only recovery path for a lost generated password — it cannot be re-read. */
  resetManagerPassword: (academyId: string, opts: Opts = {}) =>
    apiFetch<ManagerCredentials>(`/academies/${academyId}/manager/reset-password`, {
      method: 'POST',
      ...opts,
    }),

  /** Read-only for any admin. */
  userDetail: (userId: string, opts: Opts = {}) =>
    apiFetch<UserDetail>(`/admin/users/${userId}`, opts),

  /** Super admin only. */
  setUserActive: (userId: string, isActive: boolean, opts: Opts = {}) =>
    apiFetch<{ id: string; isActive: boolean }>(`/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: { isActive },
      ...opts,
    }),

  /** Super admin only. */
  setUserRole: (userId: string, role: string, grant: boolean, opts: Opts = {}) =>
    apiFetch<{ roles: string[] }>(`/admin/users/${userId}/roles`, {
      method: 'PATCH',
      body: { role, grant },
      ...opts,
    }),

  auditLogs: (opts: Opts = {}) => apiFetch<AuditLogEntry[]>('/admin/audit-logs', opts),

  roles: (opts: Opts = {}) => apiFetch<RoleWithPermissions[]>('/admin/roles', opts),

  createPermission: (key: string, opts: Opts = {}) =>
    apiFetch<{ id: string; key: string }>('/admin/permissions', {
      method: 'POST',
      body: { key },
      ...opts,
    }),

  grantRolePermission: (roleId: string, permissionId: string, opts: Opts = {}) =>
    apiFetch<unknown>('/admin/roles/permissions', {
      method: 'POST',
      body: { roleId, permissionId },
      ...opts,
    }),

  pendingReports: (opts: Opts = {}) => apiFetch<Report[]>('/moderation/reports/pending', opts),

  resolveReport: (
    reportId: string,
    body: { status: 'RESOLVED' | 'DISMISSED'; resolutionNote?: string; removeMedia?: boolean },
    opts: Opts = {},
  ) =>
    apiFetch<Report>(`/moderation/reports/${reportId}/resolve`, { method: 'PATCH', body, ...opts }),
};

export interface UserDetail extends AdminUser {
  isActive: boolean;
  playerProfile: {
    id: string;
    birthDate: string;
    primaryPosition: string | null;
    playingStyle: string | null;
    region: string | null;
    matches: number;
    goals: number;
    assists: number;
    _count: { media: number; trialApplications: number; recommendations: number };
  } | null;
  coachProfile: {
    id: string;
    status: string;
    bio: string | null;
    _count: { assessments: number };
  } | null;
  academyMemberships: { academyId: string; role: string; academy: { name: string } }[];
  scoutStats: {
    level: number;
    totalRecommendations: number;
    acceptedRecommendations: number;
    successRate: number;
    weight: number;
  } | null;
  _count: { recommendationsMade: number; sessions: number };
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  /** Joined by the API — "who did this" is the question an audit log answers. */
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
  action: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  permissions: { permission: { id: string; key: string } }[];
}

export interface Report {
  id: string;
  type: 'USER' | 'MEDIA' | 'ACADEMY' | 'COACH';
  reason: string;
  reporterId: string;
  targetUserId?: string | null;
  targetMediaId?: string | null;
  targetAcademyId?: string | null;
  targetCoachId?: string | null;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  resolutionNote?: string | null;
  createdAt: string;
}

export interface AcademyInput {
  name: string;
  region?: string;
  district?: string;
  description?: string;
  /** Attach an existing account. Mutually exclusive with `newManager`. */
  managerUserId?: string;
  /** Have the platform mint an account and return its one-time credentials. */
  newManager?: NewManagerInput;
}

export interface NewManagerInput {
  firstName: string;
  lastName: string;
  phone?: string;
}

/**
 * Returned exactly once, when an account is created or its password is reset.
 * There is no endpoint that can show these again — only the hash is stored.
 */
export interface ManagerCredentials {
  username: string;
  password: string;
}

// ---------- Endorsements (README §1.5.3) ----------

export type EndorsementRole = 'SCOUT' | 'COACH';
export type EndorsementStatus = 'ACTIVE' | 'REVOKED';

export interface Endorsement {
  id: string;
  academyId: string;
  userId: string;
  role: EndorsementRole;
  status: EndorsementStatus;
  note?: string | null;
  createdAt: string;
  revokedAt?: string | null;
  user: { id: string; firstName: string | null; lastName: string | null; avatarUrl: string | null };
}

export const endorsements = {
  list: (academyId: string, role?: EndorsementRole, opts: Opts = {}) =>
    apiFetch<Endorsement[]>(`/academies/${academyId}/endorsements${toQuery({ role })}`, opts),

  endorse: (
    academyId: string,
    body: { userId: string; role: EndorsementRole; note?: string },
    opts: Opts = {},
  ) =>
    apiFetch<Endorsement>(`/academies/${academyId}/endorsements`, {
      method: 'POST',
      body,
      ...opts,
    }),

  revoke: (academyId: string, userId: string, role: EndorsementRole, opts: Opts = {}) =>
    apiFetch<Endorsement>(`/academies/${academyId}/endorsements/${userId}/${role}`, {
      method: 'DELETE',
      ...opts,
    }),
};

/** Public recommendation record for a player — README §1.5.3. */
export interface PlayerRecommendationSummary {
  playerId: string;
  globalWeight: number;
  recommendationCount: number;
  lastRecommendedAt: string | null;
  scouts: {
    id: string;
    name: string;
    avatarUrl: string | null;
    recommendation: {
      id: string;
      weight: number;
      type: 'GLOBAL' | 'SPECIFIC';
      recommendedAcademies: string[];
      note: string | null;
      date: string;
    };
  }[];
}

// ---------- Coaches ----------

export const coaches = {
  getMine: (opts: Opts = {}) => apiFetch<CoachProfile>('/coaches/me', opts),

  createProfile: (body: { bio?: string }, opts: Opts = {}) =>
    apiFetch<CoachProfile>('/coaches/me', { method: 'POST', body, ...opts }),

  assess: (body: CreateAssessmentBody, opts: Opts = {}) =>
    apiFetch<CoachAssessment>('/coaches/assessments', { method: 'POST', body, ...opts }),

  assessmentsForPlayer: (playerId: string, opts: Opts = {}) =>
    apiFetch<CoachAssessment[]>(`/coaches/assessments/player/${playerId}`, opts),
};

export interface CreateAssessmentBody {
  playerId: string;
  speed: number;
  passing: number;
  vision: number;
  dribbling: number;
  finishing: number;
  physical: number;
  leadership: number;
  discipline: number;
  notes?: string;
}

// ---------- Recommendations ----------

/**
 * README §1.5.3. GLOBAL is addressed to nobody and open to any scout; SPECIFIC
 * names academies that have endorsed the caller (following one is not enough).
 */
export interface CreateRecommendationBody {
  playerId: string;
  type: 'GLOBAL' | 'SPECIFIC';
  academyIds?: string[];
  note?: string;
}

export const recommendations = {
  create: (body: CreateRecommendationBody, opts: Opts = {}) =>
    apiFetch<Recommendation>('/recommendations', { method: 'POST', body, ...opts }),

  /** Academies that currently endorse me — the only valid SPECIFIC targets. */
  myEndorsingAcademies: (opts: Opts = {}) =>
    apiFetch<{ academyId: string; academy: { id: string; name: string } }[]>(
      '/recommendations/endorsing-academies',
      opts,
    ),

  listMine: (opts: Opts = {}) => apiFetch<MyRecommendation[]>('/recommendations/mine', opts),

  listForAcademy: (academyId: string, opts: Opts = {}) =>
    apiFetch<Recommendation[]>(`/recommendations/academy/${academyId}`, opts),

  /** Credibility-ranked inbox — README §1.5.1/§1.5.2. */
  /** Coach: players an academy has asked me to judge. */
  myReviews: (status: 'PENDING' | 'DECIDED' = 'PENDING', opts: Opts = {}) =>
    apiFetch<CoachReview[]>(`/recommendations/reviews/mine${toQuery({ status })}`, opts),

  /** Settled: invited or turned down. */
  listHistory: (academyId: string, opts: Opts = {}) =>
    apiFetch<AcademyHistoryRow[]>(`/recommendations/academy/${academyId}/history`, opts),

  listRanked: (academyId: string, opts: Opts = {}) =>
    apiFetch<{ items: RankedRecommendation[]; total: number }>(
      `/recommendations/academy/${academyId}/ranked`,
      opts,
    ),

  updateStatus: (id: string, status: RecommendationStatus, opts: Opts = {}) =>
    apiFetch<Recommendation>(`/recommendations/${id}/status`, {
      method: 'PATCH',
      body: { status },
      ...opts,
    }),

  getPlayerSummary: (playerId: string, opts: Opts = {}) =>
    apiFetch<PlayerRecommendationSummary>(`/recommendations/player/${playerId}`, opts),

  myScoutStats: (opts: Opts = {}) => apiFetch<ScoutStats>('/recommendations/scout-stats/me', opts),
};

// ---------- Trials ----------

export const reviews = {
  /** Manager: hand a player to an endorsed coach. Omit the coach to auto-assign. */
  assign: (recommendationId: string, coachUserId: string | undefined, opts: Opts = {}) =>
    apiFetch(`/recommendations/${recommendationId}/review`, {
      method: 'POST',
      body: coachUserId ? { coachUserId } : {},
      ...opts,
    }),

  /** Coach: my queue. `DECIDED` returns what I have already answered. */
  mine: (status: 'PENDING' | 'DECIDED' = 'PENDING', opts: Opts = {}) =>
    apiFetch<CoachReview[]>(`/recommendations/reviews/mine${toQuery({ status })}`, opts),

  /** Coach: the verdict, with the ratings that become the player's credible ones. */
  decide: (
    reviewId: string,
    body: {
      decision: 'APPROVED' | 'REJECTED';
      note?: string;
      speed?: number;
      passing?: number;
      vision?: number;
      dribbling?: number;
      finishing?: number;
      physical?: number;
      leadership?: number;
      discipline?: number;
    },
    opts: Opts = {},
  ) => apiFetch(`/recommendations/reviews/${reviewId}/decision`, { method: 'POST', body, ...opts }),

  /** Manager: invite an approved player, with a note they will read. */
  invite: (recommendationId: string, note: string, opts: Opts = {}) =>
    apiFetch<{ invited: boolean }>(`/recommendations/${recommendationId}/invite`, {
      method: 'POST',
      body: { note },
      ...opts,
    }),
};

export const trials = {
  /** GET /trials — @Public(), returns upcoming trials. */
  listUpcoming: (opts: Opts = {}) => apiFetch<Trial[]>('/trials', opts),

  listForAcademy: (academyId: string, opts: Opts = {}) =>
    apiFetch<Trial[]>(`/trials/academy/${academyId}`, opts),

  getById: (id: string, opts: Opts = {}) => apiFetch<Trial>(`/trials/${id}`, opts),

  create: (academyId: string, body: CreateTrialBody, opts: Opts = {}) =>
    apiFetch<Trial>(`/trials/academy/${academyId}`, { method: 'POST', body, ...opts }),

  apply: (trialId: string, opts: Opts = {}) =>
    apiFetch<TrialApplication>(`/trials/${trialId}/apply`, { method: 'POST', ...opts }),

  myApplications: (opts: Opts = {}) =>
    apiFetch<TrialApplication[]>('/trials/applications/mine', opts),

  listApplications: (trialId: string, opts: Opts = {}) =>
    apiFetch<TrialApplication[]>(`/trials/${trialId}/applications`, opts),

  updateApplicationStatus: (
    applicationId: string,
    status: TrialApplicationStatus,
    opts: Opts = {},
  ) =>
    apiFetch<TrialApplication>(`/trials/applications/${applicationId}/status`, {
      method: 'PATCH',
      body: { status },
      ...opts,
    }),
};

export interface CreateTrialBody {
  title: string;
  ageRangeMin: number;
  ageRangeMax: number;
  positions: string[];
  location: string;
  date: string;
  requirements?: string;
}

// ---------- Media ----------

export const media = {
  /** One page of the ranked feed. Personalised, so never cached. */
  feed: (page: number, pageSize: number, opts: Opts = {}) =>
    apiFetch<FeedPage>(`/media/feed${toQuery({ page, pageSize })}`, opts),

  suggestedPlayers: (limit: number, opts: Opts = {}) =>
    apiFetch<SuggestedPlayer[]>(`/media/feed/suggested-players${toQuery({ limit })}`, opts),

  /** `category` narrows to one attribute's claim history. */
  listForPlayer: (playerId: string, category?: MediaCategory, opts: Opts = {}) =>
    apiFetch<Media[]>(`/media/player/${playerId}${toQuery({ category })}`, opts),

  /**
   * Newest clips platform-wide, each carrying its player. One request for the
   * landing strip, which used to make one per player.
   */
  listRecent: (limit?: number, opts: Opts = {}) =>
    apiFetch<RecentClip[]>(`/media/recent${toQuery({ limit })}`, opts),

  /** Whether the server can accept uploads at all — asked before recording. */
  storageStatus: (opts: Opts = {}) =>
    apiFetch<{ configured: boolean }>('/media/storage-status', opts),

  requestUpload: (
    body: {
      filename: string;
      type: MediaType;
      category: MediaCategory;
      contentType?: string;
    },
    opts: Opts = {},
  ) =>
    apiFetch<{
      storageKey: string;
      uploadUrl: string;
      expiresIn: number;
      /** Second ticket for the cover frame, from the same round trip. */
      posterUploadUrl: string;
      posterKey: string;
    }>('/media/upload-url', { method: 'POST', body, ...opts }),

  confirmUpload: (
    body: {
      storageKey: string;
      type: MediaType;
      category: MediaCategory;
      /** Required for the six attribute categories, rejected for highlights. */
      selfRating?: number;
      title?: string;
      description?: string;
      posterKey?: string;
    },
    opts: Opts = {},
  ) => apiFetch<Media>('/media/confirm', { method: 'POST', body, ...opts }),

  /** The uploader corrects their own clip. Category is deliberately not editable. */
  update: (
    id: string,
    body: { title?: string; description?: string; selfRating?: number },
    opts: Opts = {},
  ) => apiFetch<Media>(`/media/${id}`, { method: 'PATCH', body, ...opts }),

  remove: (id: string, opts: Opts = {}) =>
    apiFetch<Media>(`/media/${id}`, { method: 'DELETE', ...opts }),

  like: (id: string, opts: Opts = {}) =>
    apiFetch<unknown>(`/media/${id}/like`, { method: 'POST', ...opts }),

  unlike: (id: string, opts: Opts = {}) =>
    apiFetch<unknown>(`/media/${id}/like`, { method: 'DELETE', ...opts }),

  recordView: (id: string, opts: Opts = {}) =>
    apiFetch<unknown>(`/media/${id}/view`, { method: 'POST', ...opts }),

  engagement: (id: string, opts: Opts = {}) =>
    apiFetch<{
      mediaId: string;
      views: number;
      likes: number;
      comments: number;
      /** One like per account — see MediaService.getEngagement. */
      likedByMe: boolean;
    }>(`/media/${id}/engagement`, opts),
};

// ---------- Follows ----------

export const academyRoster = {
  /**
   * Add a coach: an existing account, or a new one minted for them. Credentials
   * for a minted account come back once and are never retrievable again.
   */
  createCoach: (
    academyId: string,
    body: { userId?: string; newCoach?: NewManagerInput; bio?: string },
    opts: Opts = {},
  ) =>
    apiFetch<{ member: AcademyMember; coachId: string; credentials?: ManagerCredentials }>(
      `/academies/${academyId}/coaches`,
      { method: 'POST', body, ...opts },
    ),

  /** Coaches, scouts and the squad; players come back sorted by assessed rating. */
  list: (
    academyId: string,
    params: { role?: AcademyMemberRole; status?: AcademyMemberStatus } = {},
    opts: Opts = {},
  ) => apiFetch<AcademyMember[]>(`/academies/${academyId}/members${toQuery(params)}`, opts),

  update: (
    academyId: string,
    memberId: string,
    body: { role?: AcademyMemberRole; status?: 'ACTIVE' | 'INACTIVE' },
    opts: Opts = {},
  ) =>
    apiFetch<AcademyMember>(`/academies/${academyId}/members/${memberId}`, {
      method: 'PATCH',
      body,
      ...opts,
    }),

  /** Let someone go, so another academy can import them. */
  release: (academyId: string, memberId: string, opts: Opts = {}) =>
    apiFetch<AcademyMember>(`/academies/${academyId}/members/${memberId}/release`, {
      method: 'POST',
      ...opts,
    }),

  transferMarket: (role: AcademyMemberRole | undefined, opts: Opts = {}) =>
    apiFetch<TransferListing[]>(`/academies/transfers/available${toQuery({ role })}`, opts),

  import: (academyId: string, memberId: string, opts: Opts = {}) =>
    apiFetch<AcademyMember>(`/academies/${academyId}/members/import`, {
      method: 'POST',
      body: { memberId },
      ...opts,
    }),

  add: (academyId: string, body: { userId: string; role: AcademyMemberRole }, opts: Opts = {}) =>
    apiFetch<AcademyMember>(`/academies/${academyId}/staff`, { method: 'POST', body, ...opts }),
};

export const follows = {
  follow: (body: { targetType: FollowTargetType; targetId: string }, opts: Opts = {}) =>
    apiFetch<Follow>('/follows', { method: 'POST', body, ...opts }),

  unfollow: (body: { targetType: FollowTargetType; targetId: string }, opts: Opts = {}) =>
    apiFetch<{ unfollowed: boolean }>('/follows', { method: 'DELETE', body, ...opts }),

  listMine: (params: { targetType?: FollowTargetType; page?: number } = {}, opts: Opts = {}) =>
    apiFetch<Page<Follow>>(`/follows/me${toQuery({ ...params })}`, opts),

  countFollowers: (targetType: FollowTargetType, targetId: string, opts: Opts = {}) =>
    apiFetch<{ followers: number }>(`/follows/count/${targetType}/${targetId}`, opts),

  /** Academy → scout trust (README §1.5.2). */
  setScoutState: (
    academyId: string,
    body: { scoutId: string; state: AcademyScoutFollowState },
    opts: Opts = {},
  ) =>
    apiFetch<AcademyScoutFollow>(`/follows/academy/${academyId}/scouts`, {
      method: 'PUT',
      body,
      ...opts,
    }),

  scoutNetwork: (academyId: string, opts: Opts = {}) =>
    apiFetch<AcademyScoutFollow[]>(`/follows/academy/${academyId}/scouts`, opts),

  academiesFollowingMe: (opts: Opts = {}) =>
    apiFetch<{ academyId: string; createdAt: string }[]>('/follows/me/academies', opts),
};

// ---------- Notifications ----------

export const notifications = {
  list: (opts: Opts = {}) => apiFetch<AppNotification[]>('/notifications', opts),

  markRead: (id: string, opts: Opts = {}) =>
    apiFetch<AppNotification>(`/notifications/${id}/read`, { method: 'PATCH', ...opts }),
};

// ---------- Auth / sessions ----------

export const auth = {
  sessions: (opts: Opts = {}) => apiFetch<DeviceSession[]>('/auth/sessions', opts),

  /**
   * `currentPassword` may be omitted only while `mustChangePassword` is set —
   * the account is still on the password an admin generated for it.
   */
  changePassword: (body: { currentPassword?: string; newPassword: string }, opts: Opts = {}) =>
    apiFetch<{ changed: boolean }>('/auth/password', { method: 'POST', body, ...opts }),
};
