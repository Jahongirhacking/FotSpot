/**
 * Typed wrappers, one group per backend controller (client/CLAUDE.md §6).
 * Route strings mirror the NestJS controllers 1:1 — if a route moves, it moves here.
 */
import { apiFetch, toQuery, type Page, type RequestOptions } from './client';
import type {
  AcademyInvitation,
  MyInvitation,
  AcademyProfile,
  AcademyPhoto,
  AcademyFeatured,
  AcademyScoutFollow,
  AcademyScoutFollowState,
  AppNotification,
  CoachAssessment,
  CoachProfile,
  DeviceSession,
  Follow,
  FollowerEntry,
  FollowTargetType,
  AcademyGroup,
  AcademyMember,
  AcademyMemberRole,
  AcademyMemberStatus,
  FeedPage,
  GroupDetail,
  MemberTransfer,
  Media,
  MediaCategory,
  MediaType,
  PendingClip,
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
  TrialStatus,
  TrialType,
  TrialVerdict,
  ProfileSummary,
  RatingRevision,
  AcademyHistoryRow,
  CoachReview,
  CoachTrial,
  MyCoachReview,
  SuggestedPlayer,
  TransferListing,
} from './types';

type Opts = Pick<RequestOptions, 'token' | 'activeRole' | 'revalidate' | 'tags' | 'cache'>;

/**
 * Paging arguments every paginated wrapper takes.
 *
 * The API caps `pageSize` at 100 and ignores anything larger, so a caller asking
 * for more gets a validation error rather than the whole table — see
 * `backend/src/common/dto/pagination.dto.ts`.
 */
export interface PageParams {
  page?: number;
  pageSize?: number;
}

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

export type DominantFoot = 'LEFT' | 'RIGHT' | 'BOTH';

/**
 * The orderings search offers, mirroring the backend's `PLAYER_SORTS`.
 *
 * `recommendations` counts how many scouts put the player forward. It is not
 * §1.5's earned weight — that lives in a row which only exists once somebody has
 * been recommended, so ordering by it sorts every unrecommended player to the
 * top. See `searchOrderBy` on the API side.
 */
export const PLAYER_SORTS = ['name', 'age', 'recommendations'] as const;
export type PlayerSort = (typeof PLAYER_SORTS)[number];

export interface PlayerSearchParams {
  region?: string;
  /** Only meaningful with a region — the API cannot resolve one without it. */
  district?: string;
  position?: string;
  playingStyle?: PlayingStyle;
  query?: string;
  /** Age in years, inclusive. The API compares against birth dates. */
  minAge?: number;
  maxAge?: number;
  dominantFoot?: DominantFoot;
  /** Omitted means newest profile first, which is what search has always done. */
  sort?: PlayerSort;
  order?: 'asc' | 'desc';
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
  /** The gallery, in the order the manager arranged it. */
  photos: (academyId: string, opts: Opts = {}) =>
    apiFetch<AcademyPhoto[]>(`/academies/${academyId}/photos`, opts),

  addPhoto: (academyId: string, body: { storageKey: string; caption?: string }, opts: Opts = {}) =>
    apiFetch<AcademyPhoto>(`/academies/${academyId}/photos`, { method: 'POST', body, ...opts }),

  reorderPhotos: (academyId: string, ids: string[], opts: Opts = {}) =>
    apiFetch<AcademyPhoto[]>(`/academies/${academyId}/photos/order`, {
      method: 'PATCH',
      body: { ids },
      ...opts,
    }),

  removePhoto: (photoId: string, opts: Opts = {}) =>
    apiFetch<{ removed: boolean }>(`/academies/photos/${photoId}`, { method: 'DELETE', ...opts }),

  /** Presigned PUT for the logo or a gallery photo. Key minted server-side. */
  imageUploadUrl: (academyId: string, filename: string, opts: Opts = {}) =>
    apiFetch<{ uploadUrl: string; storageKey: string }>(
      `/academies/${academyId}/images/upload-url`,
      {
        method: 'POST',
        body: { filename },
        ...opts,
      },
    ),

  /** Who the academy features — top players, coaches and scouts. */
  featured: (academyId: string, opts: Opts = {}) =>
    apiFetch<AcademyFeatured[]>(`/academies/${academyId}/featured`, opts),

  /** Replaces one role's list outright; ordering is the array order. */
  setFeatured: (
    academyId: string,
    body: { role: 'PLAYER' | 'COACH' | 'SCOUT'; memberIds: string[] },
    opts: Opts = {},
  ) =>
    apiFetch<AcademyFeatured[]>(`/academies/${academyId}/featured`, {
      method: 'PUT',
      body,
      ...opts,
    }),

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

// ---------- Tariff plans ----------

export const PLAN_TIERS = ['FREE', 'PRO', 'PREMIUM'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

/** One tier's limits — the five numbers a super admin edits. */
export interface TariffPlan {
  tier: PlanTier;
  /** A — clips a player may upload per window. */
  clipLimit: number;
  /** B — the length of that window, in days. */
  clipWindowDays: number;
  /** C — recommendations a scout may have awaiting a verdict at once. */
  pendingRecommendationLimit: number;
  /** D — coaches an academy manager may create. */
  maxCoaches: number;
  /** E — squad groups an academy manager may create. */
  maxGroups: number;
  updatedAt: string;
}

/**
 * A ceiling, what is used, and whether there is room.
 *
 * Whole rather than a bare boolean so a screen can say "9 of 10" *before* the
 * user tries — a limit only feels fair when it is visible in advance.
 */
export interface Quota {
  limit: number;
  used: number;
  remaining: number;
  exceeded: boolean;
}

export interface ClipQuota extends Quota {
  windowDays: number;
  /** When the oldest clip in the window ages out. Null while under the limit. */
  resetsAt: string | null;
}

/** The caller's own plan and headroom. Nulls where a role makes it meaningless. */
export interface MyPlanUsage {
  plan: TariffPlan;
  academyId: string | null;
  clips: ClipQuota | null;
  recommendations: Quota | null;
  coaches: Quota | null;
  groups: Quota | null;
}

export const tariffs = {
  /** All three tiers. Readable by anyone signed in — a limit nobody can look up
   *  reads as a bug when it bites. */
  list: (opts: Opts = {}) => apiFetch<TariffPlan[]>('/tariff-plans', opts),

  /** My plan and how much of it I have used. */
  mine: (opts: Opts = {}) => apiFetch<MyPlanUsage>('/tariff-plans/me', opts),

  /** Super admin only: edit one tier's numbers. Partial — send what changed. */
  update: (
    tier: PlanTier,
    body: Partial<Omit<TariffPlan, 'tier' | 'updatedAt'>>,
    opts: Opts = {},
  ) => apiFetch<TariffPlan>(`/tariff-plans/${tier}`, { method: 'PATCH', body, ...opts }),
};

// ---------- Admin console ----------

/** What the super admin types to have an admin account minted. */
export interface NewAdminInput {
  firstName: string;
  lastName: string;
  phone?: string;
}

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
  /** The tariff this account is on. Only a super admin can move it. */
  planTier?: PlanTier;
  /** False for super admins — the bootstrap account must stay reachable. */
  revocable?: boolean;
}

export const admin = {
  listAdmins: (opts: Opts = {}) => apiFetch<AdminUser[]>('/admin/admins', opts),

  /** Admin-gated user lookup, so promoting someone doesn't mean pasting a UUID. */
  searchUsers: (query: string, opts: Opts = {}) =>
    apiFetch<Page<AdminUser>>(`/admin/users${toQuery({ query, pageSize: 10 })}`, opts),

  /**
   * Mints an admin account and returns its one-time credentials.
   *
   * Creates rather than promotes: admins are staff, not users who happen to be on
   * the platform already — see the backend's CreateAdminDto. The password in the
   * response exists nowhere else, so the caller must show it before discarding it.
   */
  createAdmin: (body: NewAdminInput, opts: Opts = {}) =>
    apiFetch<{ userId: string; credentials: ManagerCredentials }>('/admin/admins', {
      method: 'POST',
      body,
      ...opts,
    }),

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

  /**
   * Move an account onto another tariff — super admin only.
   *
   * The only way a plan ever changes: nobody upgrades themselves, so this is
   * both the sales desk and the support desk for every limit in the product.
   */
  setUserPlan: (userId: string, tier: PlanTier, opts: Opts = {}) =>
    apiFetch<{ id: string; planTier: PlanTier }>(`/admin/users/${userId}/plan`, {
      method: 'PATCH',
      body: { tier },
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

  /** Paginated: the length of this queue is set by reporters, not by us. */
  pendingReports: (params: PageParams = {}, opts: Opts = {}) =>
    apiFetch<Page<Report>>(`/moderation/reports/pending${toQuery({ ...params })}`, opts),

  resolveReport: (
    reportId: string,
    body: { status: 'RESOLVED' | 'DISMISSED'; resolutionNote?: string; removeMedia?: boolean },
    opts: Opts = {},
  ) =>
    apiFetch<Report>(`/moderation/reports/${reportId}/resolve`, { method: 'PATCH', body, ...opts }),

  // ---- Video review. Every upload lands here before anybody can watch it. ----

  /** The clips waiting for a decision, newest first, each with its player. */
  pendingMedia: (params: PageParams = {}, opts: Opts = {}) =>
    apiFetch<Page<PendingClip>>(`/moderation/media/pending${toQuery({ ...params })}`, opts),

  /**
   * Clips an admin has blocked — super admin only.
   *
   * Paginated: nothing shortens this list except a permanent delete, so it only
   * ever grows.
   */
  blockedMedia: (params: PageParams = {}, opts: Opts = {}) =>
    apiFetch<Page<PendingClip>>(`/moderation/media/blocked${toQuery({ ...params })}`, opts),

  /** Approve: the clip becomes publicly visible and leaves the queue. */
  verifyMedia: (mediaId: string, opts: Opts = {}) =>
    apiFetch<Media>(`/moderation/media/${mediaId}/verify`, { method: 'PATCH', ...opts }),

  /** Take down: invisible to everyone but its uploader; the row is kept. */
  blockMedia: (mediaId: string, opts: Opts = {}) =>
    apiFetch<Media>(`/moderation/media/${mediaId}/block`, { method: 'PATCH', ...opts }),

  /** Destroy the clip and its files. Super admin only, and irreversible. */
  deleteMedia: (mediaId: string, opts: Opts = {}) =>
    apiFetch<{ deleted: boolean; mediaId: string }>(`/moderation/media/${mediaId}`, {
      method: 'DELETE',
      ...opts,
    }),
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

  assessmentsForPlayer: (playerId: string, params: PageParams = {}, opts: Opts = {}) =>
    apiFetch<Page<CoachAssessment>>(
      `/coaches/assessments/player/${playerId}${toQuery({ ...params })}`,
      opts,
    ),
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
 * A scout's public reputation page.
 *
 * Deliberately no list of the players they put forward: that is a list of
 * minors, ranked by how promising somebody thinks they are (README §11.3,
 * §21.5). Counts and endorsements say what a reader needs about the scout's
 * record without publishing an index of children.
 */
export interface ScoutProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  avatarUrl: string | null;
  createdAt: string;
  isActive: boolean;
  stats: {
    level: number;
    weight: number;
    successRate: number;
    totalRecommendations: number;
    acceptedRecommendations: number;
    pendingRecommendations: number;
  };
  endorsements: { academyId: string; academy: { id: string; name: string } }[];
  /**
   * Where this scout stands with the academy the *viewer* runs, or null when the
   * viewer runs none. Sent with the profile so the one action on the page can be
   * drawn in the right state on first paint.
   */
  viewerAcademy: {
    academyId: string;
    academyName: string;
    /** Only a verified academy's scouts reach private profiles. */
    verified: boolean;
    isMember: boolean;
    invitationPending: boolean;
    isEndorsed: boolean;
  } | null;
}

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

  listMine: (params: PageParams = {}, opts: Opts = {}) =>
    apiFetch<Page<MyRecommendation>>(`/recommendations/mine${toQuery({ ...params })}`, opts),

  listForAcademy: (academyId: string, opts: Opts = {}) =>
    apiFetch<Recommendation[]>(`/recommendations/academy/${academyId}`, opts),

  /** Credibility-ranked inbox — README §1.5.1/§1.5.2. */
  /**
   * Coach: my own review of one player, or null if nobody assigned them to me.
   *
   * Null is the rule rather than an empty state — a coach may only judge players
   * an academy put in front of them.
   */
  myReviewFor: (playerId: string, opts: Opts = {}) =>
    apiFetch<MyCoachReview | null>(`/recommendations/player/${playerId}/my-review`, opts),

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

  myScoutStats: (opts: Opts = {}) =>
    apiFetch<ScoutStats & { pending: Quota }>('/recommendations/scout-stats/me', opts),

  /**
   * One scout's reputation page.
   *
   * 403 for a coach, by design — see `mayViewScoutProfile`. The backend refuses
   * it too, so a coach who types the URL is told no rather than shown the page.
   */
  scoutProfile: (scoutId: string, opts: Opts = {}) =>
    apiFetch<ScoutProfile>(`/recommendations/scouts/${scoutId}`, opts),
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

  /**
   * Coach: ACCEPT or REJECT, and why.
   *
   * No ratings, deliberately — TRIAL.md Rule 22. A review asks one question, and
   * scoring a player is squad work that needs a shared group (Rule 21).
   */
  decide: (
    reviewId: string,
    body: { decision: 'APPROVED' | 'REJECTED'; note?: string },
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
  /**
   * How many trials have appeared since this account last opened the list.
   *
   * Drives the badge on the Trials menu entry — see `markTrialsSeen`, which
   * clears it.
   */
  unseenCount: (opts: Opts = {}) =>
    apiFetch<{ count: number; since: string | null }>('/trials/unseen-count', opts),

  /** Clears the badge. Sent when the trials list is opened. */
  markSeen: (opts: Opts = {}) =>
    apiFetch<{ seenAt: string }>('/trials/seen', { method: 'POST', ...opts }),

  /** GET /trials — @Public(), returns upcoming trials. */
  listUpcoming: (opts: Opts = {}) => apiFetch<Trial[]>('/trials', opts),

  listForAcademy: (academyId: string, opts: Opts = {}) =>
    apiFetch<Trial[]>(`/trials/academy/${academyId}`, opts),

  /** The academy's finished trials, newest first. Manager-only, paginated. */
  archivedForAcademy: (
    academyId: string,
    params: { page?: number; pageSize?: number } = {},
    opts: Opts = {},
  ) => apiFetch<Page<Trial>>(`/trials/academy/${academyId}/history${toQuery({ ...params })}`, opts),

  /** Coach: the trials I am assigned to work. */
  myCoaching: (opts: Opts = {}) => apiFetch<CoachTrial[]>('/trials/coaching/mine', opts),

  getById: (id: string, opts: Opts = {}) => apiFetch<Trial>(`/trials/${id}`, opts),

  create: (academyId: string, body: CreateTrialBody, opts: Opts = {}) =>
    apiFetch<Trial>(`/trials/academy/${academyId}`, { method: 'POST', body, ...opts }),

  /** Who works this trial. */
  listCoaches: (trialId: string, opts: Opts = {}) =>
    apiFetch<{ id: string; firstName: string | null; lastName: string | null }[]>(
      `/trials/${trialId}/coaches`,
      opts,
    ),

  /** Names the coaches working this trial, replacing the list. */
  assignCoaches: (trialId: string, coachUserIds: string[], opts: Opts = {}) =>
    apiFetch(`/trials/${trialId}/coaches`, { method: 'POST', body: { coachUserIds }, ...opts }),

  /** Invite a screened player to a private trial, with the note they will read. */
  invite: (applicationId: string, note: string, opts: Opts = {}) =>
    apiFetch<TrialApplication>(`/trials/applications/${applicationId}/invite`, {
      method: 'POST',
      body: { note },
      ...opts,
    }),

  /** The player's yes or no to a private trial invitation. */
  respond: (applicationId: string, accept: boolean, opts: Opts = {}) =>
    apiFetch<TrialApplication>(`/trials/applications/${applicationId}/respond`, {
      method: 'POST',
      body: { accept },
      ...opts,
    }),

  /**
   * The coach's PASS or FAIL, after testing the player in person.
   *
   * Assigned coaches only, and only one per application. No ratings — one
   * morning is not a season, so attributes wait until the player is in a squad
   * group somebody coaches (TRIAL.md Rules 21–22).
   */
  recordVerdict: (
    applicationId: string,
    body: { verdict: TrialVerdict; note?: string },
    opts: Opts = {},
  ) => apiFetch(`/trials/applications/${applicationId}/verdict`, { method: 'POST', body, ...opts }),

  /** Take the player on — sends them an invitation to join the academy. */
  addToSquad: (applicationId: string, opts: Opts = {}) =>
    apiFetch(`/trials/applications/${applicationId}/squad`, { method: 'POST', ...opts }),

  /** Edit a published trial, or archive it. Hosting manager only. */
  update: (
    trialId: string,
    body: Partial<CreateTrialBody> & { status?: TrialStatus },
    opts: Opts = {},
  ) => apiFetch<Trial>(`/trials/${trialId}`, { method: 'PATCH', body, ...opts }),

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
  /** Omitted means GENERAL — the open board. */
  type?: TrialType;
  ageRangeMin: number;
  ageRangeMax: number;
  positions: string[];
  location: string;
  /** When the examination happens. */
  date: string;
  /** Last moment somebody may apply. Must not be after `date`. */
  applyDeadline: string;
  requirements?: string;
  /** Sanitised HTML from the note editor. The server sanitises it again. */
  note?: string;
}

// ---------- Media ----------

export const media = {
  /** One page of the ranked feed. Personalised, so never cached. */
  feed: (page: number, pageSize: number, opts: Opts = {}) =>
    apiFetch<FeedPage>(`/media/feed${toQuery({ page, pageSize })}`, opts),

  suggestedPlayers: (limit: number, opts: Opts = {}) =>
    apiFetch<SuggestedPlayer[]>(`/media/feed/suggested-players${toQuery({ limit })}`, opts),

  /** `category` narrows to one attribute's claim history. */
  listForPlayer: (
    playerId: string,
    category?: MediaCategory,
    params: PageParams = {},
    opts: Opts = {},
  ) => apiFetch<Page<Media>>(`/media/player/${playerId}${toQuery({ category, ...params })}`, opts),

  /**
   * Newest clips platform-wide, each carrying its player. One request for the
   * landing strip, which used to make one per player.
   */
  listRecent: (limit?: number, opts: Opts = {}) =>
    apiFetch<RecentClip[]>(`/media/recent${toQuery({ limit })}`, opts),

  /**
   * Whether the server can accept uploads at all, and how many clips this
   * player has left in their plan's window — asked before recording.
   *
   * `quota` is null for an account with no player profile: there is nothing to
   * limit, and a zero would read as "you have used them all".
   */
  storageStatus: (opts: Opts = {}) =>
    apiFetch<{ configured: boolean; quota: ClipQuota | null }>('/media/storage-status', opts),

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
      /** Required for every attribute category, rejected for highlights. */
      rating?: number;
      title?: string;
      description?: string;
      posterKey?: string;
    },
    opts: Opts = {},
  ) => apiFetch<Media>('/media/confirm', { method: 'POST', body, ...opts }),

  /** The uploader corrects their own clip. Category is deliberately not editable. */
  update: (
    id: string,
    body: { title?: string; description?: string; rating?: number },
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

export const groups = {
  /** An academy's squads, plus how many sit in the reserve. */
  list: (academyId: string, opts: Opts = {}) =>
    apiFetch<{ groups: AcademyGroup[]; reserveCount: number }>(
      `/academies/${academyId}/groups`,
      opts,
    ),

  getById: (groupId: string, opts: Opts = {}) =>
    apiFetch<GroupDetail>(`/academies/groups/${groupId}`, opts),

  /** A coach's own groups. */
  mine: (opts: Opts = {}) => apiFetch<GroupDetail[]>('/academies/groups/mine', opts),

  create: (
    academyId: string,
    body: { name: string; description?: string; imageKey?: string },
    opts: Opts = {},
  ) => apiFetch<AcademyGroup>(`/academies/${academyId}/groups`, { method: 'POST', body, ...opts }),

  update: (
    groupId: string,
    body: { name?: string; description?: string; imageKey?: string },
    opts: Opts = {},
  ) => apiFetch<AcademyGroup>(`/academies/groups/${groupId}`, { method: 'PATCH', body, ...opts }),

  /** Removes the squad, not the people in it — they return to the reserve. */
  remove: (groupId: string, opts: Opts = {}) =>
    apiFetch<{ deleted: boolean }>(`/academies/groups/${groupId}`, { method: 'DELETE', ...opts }),

  /** Omit `groupId` to send them back to the reserve. */
  move: (academyId: string, memberIds: string[], groupId?: string, opts: Opts = {}) =>
    apiFetch<{ moved: number }>(`/academies/${academyId}/groups/move`, {
      method: 'POST',
      body: { memberIds, ...(groupId ? { groupId } : {}) },
      ...opts,
    }),
};

export const transfers = {
  /** Offer a member to another academy. Nothing moves until they answer. */
  request: (
    academyId: string,
    body: { memberId: string; toAcademyId: string; note?: string },
    opts: Opts = {},
  ) =>
    apiFetch<MemberTransfer>(`/academies/${academyId}/transfers`, {
      method: 'POST',
      body,
      ...opts,
    }),

  list: (academyId: string, direction: 'incoming' | 'outgoing', opts: Opts = {}) =>
    apiFetch<MemberTransfer[]>(`/academies/${academyId}/transfers${toQuery({ direction })}`, opts),

  approve: (transferId: string, opts: Opts = {}) =>
    apiFetch(`/academies/transfers/${transferId}/approve`, { method: 'POST', ...opts }),

  reject: (transferId: string, opts: Opts = {}) =>
    apiFetch(`/academies/transfers/${transferId}/reject`, { method: 'POST', ...opts }),

  cancel: (transferId: string, opts: Opts = {}) =>
    apiFetch(`/academies/transfers/${transferId}/cancel`, { method: 'POST', ...opts }),
};

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
};

export const invitations = {
  /** Ask somebody to join. Nothing is written to their record until they accept. */
  send: (
    academyId: string,
    body: { userId: string; role: AcademyMemberRole; note?: string },
    opts: Opts = {},
  ) =>
    apiFetch<AcademyInvitation>(`/academies/${academyId}/invitations`, {
      method: 'POST',
      body,
      ...opts,
    }),

  /** What an academy has asked of people, answered or not. */
  listForAcademy: (academyId: string, opts: Opts = {}) =>
    apiFetch<AcademyInvitation[]>(`/academies/${academyId}/invitations`, opts),

  /** What has been asked of me. */
  listMine: (opts: Opts = {}) => apiFetch<MyInvitation[]>('/academies/invitations/mine', opts),

  accept: (invitationId: string, opts: Opts = {}) =>
    apiFetch<AcademyInvitation>(`/academies/invitations/${invitationId}/accept`, {
      method: 'POST',
      ...opts,
    }),

  reject: (invitationId: string, opts: Opts = {}) =>
    apiFetch<AcademyInvitation>(`/academies/invitations/${invitationId}/reject`, {
      method: 'POST',
      ...opts,
    }),

  /** The academy withdrawing a question nobody has answered yet. */
  cancel: (invitationId: string, opts: Opts = {}) =>
    apiFetch<AcademyInvitation>(`/academies/invitations/${invitationId}/cancel`, {
      method: 'POST',
      ...opts,
    }),
};

export const clipRatings = {
  /** A verified coach replaces the rating on a clip they have watched. */
  set: (mediaId: string, rating: number, opts: Opts = {}) =>
    apiFetch<Media>(`/media/${mediaId}/rating`, { method: 'PATCH', body: { rating }, ...opts }),

  /** What that rating was before each change, newest first. */
  history: (mediaId: string, opts: Opts = {}) =>
    apiFetch<RatingRevision[]>(`/media/${mediaId}/rating/history`, opts),
};

export const follows = {
  /** People following your card, and academies following you as a scout. */
  followers: (opts: Opts = {}) =>
    apiFetch<{ items: FollowerEntry[]; total: number }>('/follows/followers', opts),

  follow: (body: { targetType: FollowTargetType; targetId: string }, opts: Opts = {}) =>
    apiFetch<Follow>('/follows', { method: 'POST', body, ...opts }),

  unfollow: (body: { targetType: FollowTargetType; targetId: string }, opts: Opts = {}) =>
    apiFetch<{ unfollowed: boolean }>('/follows', { method: 'DELETE', body, ...opts }),

  listMine: (params: { targetType?: FollowTargetType; page?: number } = {}, opts: Opts = {}) =>
    apiFetch<Page<Follow>>(`/follows/me${toQuery({ ...params })}`, opts),

  countFollowers: (targetType: FollowTargetType, targetId: string, opts: Opts = {}) =>
    apiFetch<{ followers: number }>(`/follows/count/${targetType}/${targetId}`, opts),

  /** Whether the caller follows one target. Requires a session — 401 for guests. */
  status: (targetType: FollowTargetType, targetId: string, opts: Opts = {}) =>
    apiFetch<{ following: boolean; since: string | null }>(
      `/follows/status/${targetType}/${targetId}`,
      opts,
    ),

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

  /** Clear the whole list. Returns how many were actually unread. */
  markAllRead: (opts: Opts = {}) =>
    apiFetch<{ count: number }>('/notifications/read-all', { method: 'PATCH', ...opts }),
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
