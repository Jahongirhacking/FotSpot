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
  Media,
  MediaCategory,
  MediaType,
  PlayerProfile,
  PlayingStyle,
  RankedRecommendation,
  Recommendation,
  RecommendationStatus,
  ScoutStats,
  Trial,
  TrialApplication,
  TrialApplicationStatus,
} from './types';

type Opts = Pick<RequestOptions, 'token' | 'revalidate' | 'tags' | 'cache'>;

// ---------- Users ----------

export const users = {
  me: (opts: Opts = {}) => apiFetch<MeResponse>('/users/me', opts),

  /** Identity + roles + per-role counters for the profile screen, in one request. */
  myProfile: (opts: Opts = {}) => apiFetch<MyProfileResponse>('/users/me/profile', opts),

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
};

export interface UpdateProfileBody {
  firstName?: string;
  lastName?: string;
  avatarStorageKey?: string;
}

export interface AvatarUploadUrl {
  uploadUrl: string;
  storageKey: string;
  publicUrl: string;
  /** False while R2 credentials are unset — the PUT will not persist bytes. */
  storageConfigured: boolean;
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
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
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
      playingStyle: PlayingStyle | null;
      region: string | null;
      matches: number;
      goals: number;
      assists: number;
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
};

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

  listMine: (opts: Opts = {}) => apiFetch<Recommendation[]>('/recommendations/mine', opts),

  listForAcademy: (academyId: string, opts: Opts = {}) =>
    apiFetch<Recommendation[]>(`/recommendations/academy/${academyId}`, opts),

  /** Credibility-ranked inbox — README §1.5.1/§1.5.2. */
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
  listForPlayer: (playerId: string, opts: Opts = {}) =>
    apiFetch<Media[]>(`/media/player/${playerId}`, opts),

  requestUpload: (
    body: { filename: string; type: MediaType; category: MediaCategory },
    opts: Opts = {},
  ) =>
    apiFetch<{ storageKey: string; uploadUrl: string }>('/media/upload-url', {
      method: 'POST',
      body,
      ...opts,
    }),

  confirmUpload: (
    body: { storageKey: string; type: MediaType; category: MediaCategory },
    opts: Opts = {},
  ) => apiFetch<Media>('/media/confirm', { method: 'POST', body, ...opts }),

  like: (id: string, opts: Opts = {}) =>
    apiFetch<unknown>(`/media/${id}/like`, { method: 'POST', ...opts }),

  unlike: (id: string, opts: Opts = {}) =>
    apiFetch<unknown>(`/media/${id}/like`, { method: 'DELETE', ...opts }),

  recordView: (id: string, opts: Opts = {}) =>
    apiFetch<unknown>(`/media/${id}/view`, { method: 'POST', ...opts }),

  engagement: (id: string, opts: Opts = {}) =>
    apiFetch<{ mediaId: string; views: number; likes: number; comments: number }>(
      `/media/${id}/engagement`,
      opts,
    ),
};

// ---------- Follows ----------

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
};
