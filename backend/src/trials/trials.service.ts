import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ListTrialsQueryDto,
  AssignCoachesDto,
  CreateTrialDto,
  RecordTrialVerdictDto,
  UpdateTrialApplicationStatusDto,
  UpdateTrialDto,
} from './dto/trial.dto';
import { TrialBackingsService } from '../recommendations/trial-backings.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { InvitationsService } from '../academies/invitations.service';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';
import { ageAt, birthDateForAge } from '../common/age.util';
import { normaliseKeywords } from '../common/seo-keywords.util';
import { academyMediaPrefix, assertKeyUnder } from '../storage/storage.keys';
import { StorageService } from '../storage/storage.service';

/** The academy shape `withCoverUrl` folds into a trial. */
interface AcademySummaryRow {
  id: string;
  name: string;
  region: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  logoKey: string | null;
}
import { ageReferenceDate, patchedDate, validateWindow } from './trial-window.util';
import { assertGenderEligible, genderFilterFor } from './trial-eligibility.util';
import {
  compareNewest,
  compareRecommended,
  matchesAge,
  type ViewerProfile,
} from './trial-recommendation.util';
import { regionCentre } from '../common/uzbekistan';
import { sanitizeRichText } from '../common/rich-text.util';
import { assertNotLocalTeam, isLocalTeam } from '../academies/academy-kind.util';
import { SmsService } from '../sms/sms.service';

@Injectable()
export class TrialsService {
  private readonly logger = new Logger(TrialsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private backings: TrialBackingsService,
    private invitations: InvitationsService,
    private recommendations: RecommendationsService,
    private redis: RedisService,
    private sms: SmsService,
    private storage: StorageService,
  ) {}

  async create(userId: string, academyId: string, dto: CreateTrialDto) {
    await this.assertAcademyManager(userId, academyId);

    /*
     * A local team does not hold trials.
     *
     * Refused at creation and nowhere else, deliberately: applying, accepting,
     * rejecting and the coach's pass/fail all hang off a trial row, so a kind
     * that can never own one cannot reach any of them. Guarding each of those
     * separately would be five checks defending a door that has no room behind
     * it — and five places for the rule to drift.
     */
    const academy = await this.prisma.academyProfile.findUnique({
      where: { id: academyId },
      select: { kind: true },
    });
    if (!academy) throw new NotFoundException('Academy not found');
    assertNotLocalTeam(academy.kind, 'hold trials');

    /*
     * The window is optional as a whole, and validated as a whole.
     *
     * `validateWindow` owns the rules (all four fields or none, end not before
     * start, deadline not after the opening day); this owns the wording. An
     * open-ended trial passes with every field null, which is the case the
     * checkbox on the form produces.
     */
    const date = dto.date ? new Date(dto.date) : null;
    const endDate = dto.endDate ? new Date(dto.endDate) : null;
    const applyDeadline = dto.applyDeadline ? new Date(dto.applyDeadline) : null;

    this.assertWindow({
      startsAt: date,
      endsAt: endDate,
      startTime: dto.startTime ?? null,
      endTime: dto.endTime ?? null,
      applyDeadline,
    });

    const coverKey = dto.coverKey ? this.assertOwnCoverKey(academyId, dto.coverKey) : null;

    /*
     * Who runs it — TRIAL.md §1.1.
     * The manager names the coaches, and only coaches the academy has endorsed
     * count: endorsement is what an academy's trust in a coach *is*. With none
     * named, everybody endorsed is attached, so a published open day is never a
     * session nobody can see the applicants of. `assignCoaches` remains the
     * way to change the staff later. The staff is who records the verdict
     * (§10), so a trial with nobody on it is one nobody can answer.
     *
     * Checked before anything is written: a refused coach must not leave a
     * trial behind, announced to every follower, with nobody on it. And taken
     * *off* the row's fields — it is a relation, not a column.
     */
    const { coachUserIds, ...fields } = dto;
    const endorsed = await this.prisma.academyEndorsement.findMany({
      where: { academyId, role: 'COACH', status: 'ACTIVE' },
      select: { userId: true },
    });
    const endorsedIds = new Set(endorsed.map((row) => row.userId));
    const named = coachUserIds ?? [];
    const unknown = named.filter((id) => !endorsedIds.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException('Every assigned coach must be a coach of this academy');
    }
    const staff = named.length > 0 ? named : [...endorsedIds];

    const trial = await this.prisma.trial.create({
      // Sanitised here rather than trusted from the client: the editor cleans as
      // a convenience for the person typing, but this endpoint is reachable
      // without it.
      data: {
        academyId,
        ...fields,
        date,
        endDate,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        gender: dto.gender ?? 'male',
        coverKey,
        // Normalised rather than trusted: the form de-duplicates as a courtesy,
        // this endpoint is reachable without it.
        seoKeywords: normaliseKeywords(dto.seoKeywords),
        applyDeadline,
        note: sanitizeRichText(dto.note),
      },
    });

    if (staff.length > 0) {
      await this.prisma.trialCoach.createMany({
        data: staff.map((coachUserId) => ({ trialId: trial.id, coachUserId })),
        skipDuplicates: true,
      });
    }
    // Announced last, once the staff is on it: the message names a session
    // somebody can already open and see the applicants of.
    await this.announceToMatchingPlayers(trial, userId);
    return this.withCoverUrl(trial);
  }

  /**
   * Tells the players a new trial is actually for.
   *
   * ## Matched, not broadcast
   *
   * A notification that does not apply to you is how somebody learns to ignore
   * the ones that do. So this reaches only players who **follow the academy**,
   * whose **primary or secondary position** is one the academy asked for, whose
   * **gender** the trial is for, and whose **age on the day of the trial**
   * falls inside the stated range — the same fields the manager filled in,
   * which makes the message true by construction rather than by a ranking
   * anybody has to trust. Telegram gets a copy for every player who connected
   * it; that is `NotificationsService.notify`'s doing, not this method's.
   *
   * Age is computed against the trial date rather than today, because that is
   * the rule `apply` enforces: a boy who turns 14 the week before a U14 morning
   * is eligible, and telling him about it and then refusing his application
   * would be worse than staying quiet.
   *
   * ## Private trials say nothing
   *
   * A private trial is a session for one named child (TRIAL.md §11) and carries
   * no positions or age range at all. Announcing one would tell a stranger that
   * child is being looked at.
   */
  private async announceToMatchingPlayers(
    trial: {
      id: string;
      academyId: string;
      title: string;
      date: Date | null;
      type: string;
      positions: string[];
      gender: string;
      ageRangeMin: number | null;
      ageRangeMax: number | null;
    },
    actorUserId: string,
  ) {
    if (trial.type !== 'GENERAL') return;

    /*
     * Age is filtered as a birth-date window, in the query.
     *
     * The alternative — read every player and compute ages in memory — is a full
     * table scan of a table that grows with every signup, run inside the request
     * that creates a trial. Ages become dates once, here, and the database uses
     * its index on the column.
     */
    const bounds: { gt?: Date; lte?: Date } = {};
    /*
     * Oldest allowed, and the boundary is **exclusive**.
     *
     * `birthDateForAge(date, max + 1)` is the day somebody turns `max + 1` on the
     * trial date — already a year too old. `gte` therefore let them through: a
     * trial for 16–18-year-olds notified a player born exactly nineteen years
     * before it, because the bound included its own edge. Caught by seeding a
     * player at exactly max + 1 and watching them get the notification.
     *
     * `gt` excludes that day and keeps every day after it, which is the rule the
     * range states. The lower bound below stays `lte` for the mirror reason:
     * somebody turning `min` *on* the trial date is old enough, and inclusive is
     * what makes that true.
     */
    /*
     * An open-ended trial has no day to judge against, so age is judged today —
     * see `ageReferenceDate`. Treating a missing date as "no age limit" would
     * quietly widen a 12–14 trial to everybody.
     */
    const judgedOn = ageReferenceDate(trial);
    if (trial.ageRangeMax != null) bounds.gt = birthDateForAge(judgedOn, trial.ageRangeMax + 1);
    // Youngest allowed: born no later than (reference date − minAge).
    if (trial.ageRangeMin != null) bounds.lte = birthDateForAge(judgedOn, trial.ageRangeMin);

    const matches = await this.prisma.playerProfile.findMany({
      where: {
        // A trial that names positions reaches players in one of them; one that
        // names none is for every position.
        ...(trial.positions.length > 0
          ? {
              OR: [
                { primaryPosition: { in: trial.positions } },
                { secondaryPosition: { in: trial.positions } },
              ],
            }
          : {}),
        // And the trial's gender, unless it is open to everybody. The profile's
        // gender is a free string, compared the way the application rule
        // compares it (trial-eligibility.util).
        ...(genderFilterFor(trial.gender) ?? {}),
        ...(bounds.gt || bounds.lte ? { birthDate: bounds } : {}),
        user: {
          // A private account has asked not to be found; an unannounced trial is
          // part of what that buys.
          isPrivate: false,
          isActive: true,
          /*
           * And they must have asked to hear from *this* academy.
           *
           * Position and age already made the message true, but true is not the
           * same as wanted: a fifteen-year-old goalkeeper matches every U16
           * goalkeeping trial in the country, and a product that texts them all
           * of them is a product they mute. Following an academy is the player
           * saying which ones they want.
           *
           * Reuses the existing `Follow` row — `targetType: ACADEMY` already
           * means exactly this, and its `@@unique([followerId, targetType,
           * targetId])` already makes a duplicate follow impossible. A second
           * table for the same statement would need its own uniqueness, its own
           * cleanup on account deletion, and a rule for what it means when the
           * two disagree.
           */
          follows: { some: { targetType: 'ACADEMY', targetId: trial.academyId } },
        },
      },
      select: { userId: true },
    });

    const academy = await this.prisma.academyProfile.findUnique({
      where: { id: trial.academyId },
      select: { name: true },
    });

    for (const match of matches) {
      await this.notifications.notify(
        match.userId,
        'TRIAL_PUBLISHED',
        {
          trialId: trial.id,
          trialTitle: trial.title,
          academyId: trial.academyId,
          academyName: academy?.name ?? null,
          date: trial.date,
          positions: trial.positions,
        },
        { userId: actorUserId, role: 'academy_manager' },
      );
    }
  }

  /**
   * How far the trials list has moved since this account last looked.
   *
   * Drives the badge on the Trials menu entry. Counted per role, because "a
   * trial worth knowing about" is a different set for each: a player is offered
   * open general trials they could apply to, while academy staff are told about
   * their own academy's new ones and nobody else's.
   */
  async unseenCount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { trialsSeenAt: true },
    });
    // Null means never opened — everything currently open is new to them.
    const since = user?.trialsSeenAt ?? undefined;
    const now = new Date();

    const membership = await this.prisma.academyMember.findFirst({
      where: { userId, role: { in: ['MANAGER', 'COACH'] }, status: 'ACTIVE' },
      select: { academyId: true },
    });

    // Staff see their own academy's; everybody else sees the public list. A
    // coach who is also a player gets the staff answer, matching the menu they
    // are looking at.
    const where = membership
      ? { academyId: membership.academyId, status: 'OPEN' as const }
      : {
          status: 'OPEN' as const,
          type: 'GENERAL' as const,
          /*
           * Two independent conditions, so `AND` of two `OR`s rather than two
           * `OR` keys — an object cannot hold the same key twice, and the second
           * would silently replace the first.
           *
           * Each says the same thing about a missing value: null means "no
           * limit given", never "already past". An open-ended trial has no date
           * to be in the future and runs until it is archived; a trial with no
           * deadline takes applications until it does.
           */
          AND: [
            { OR: [{ date: null }, { date: { gte: now } }] },
            // Only ones they could still act on: a closed deadline is not news.
            { OR: [{ applyDeadline: null }, { applyDeadline: { gte: now } }] },
          ],
        };

    const count = await this.prisma.trial.count({
      where: { ...where, ...(since ? { createdAt: { gt: since } } : {}) },
    });

    return { count, since: since ?? null };
  }

  /** Clears the badge. Called when the trials list is opened. */
  async markSeen(userId: string) {
    const seenAt = new Date();
    await this.prisma.user.update({ where: { id: userId }, data: { trialsSeenAt: seenAt } });
    return { seenAt };
  }

  /**
   * An academy's trials, as the person asking is allowed to see them.
   *
   * ## Why this is not simply "the academy's trials"
   *
   * A **private trial exists for one named child**. Its title is generated as
   * `Private trial — <player name>`, and the page it appears on carries the date
   * and the place as well. This route is `@Public()`, and it was returning them
   * to anybody: an anonymous request for an academy returned a list of the
   * children that academy had invited, where each of them would be, and when.
   *
   * That is not a presentation problem to solve by hiding a section in the UI —
   * the JSON was the leak. So the filter is here, and the caller decides nothing.
   *
   * ## Who may see the private half
   *
   * The academy's own staff: a manager runs the invitations, and a coach may be
   * working the session. Anybody else — a guest, a player, a scout, another
   * academy — gets the general trials, which are public by definition because
   * they are advertised for people to apply to.
   */
  async listForAcademy(academyId: string, viewerUserId?: string) {
    const staff = viewerUserId
      ? await this.prisma.academyMember.findFirst({
          where: {
            academyId,
            userId: viewerUserId,
            role: { in: ['MANAGER', 'COACH'] },
            status: 'ACTIVE',
          },
          select: { id: true },
        })
      : null;

    const trials = await this.prisma.trial.findMany({
      where: { academyId, status: 'OPEN', ...(staff ? {} : { type: 'GENERAL' }) },
      orderBy: { date: 'asc' },
      include: { academy: { select: TrialsService.ACADEMY_SUMMARY } },
    });
    return trials.map((trial) => this.withCoverUrl(trial));
  }

  /**
   * The history: everything this academy has finished, newest first.
   *
   * Paginated rather than capped, because "show me the U14 morning from two
   * springs ago" is exactly what a history is for, and a hard limit would make
   * the oldest records unreachable — including the applications attached to
   * them, which are decisions somebody made about a child.
   */
  async listArchivedForAcademy(userId: string, academyId: string, page = 1, pageSize = 10) {
    await this.assertAcademyManager(userId, academyId);

    const where = { academyId, status: 'ARCHIVED' as const };
    const [items, total] = await Promise.all([
      this.prisma.trial.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.trial.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * The players this coach still owes a verdict, newest session first.
   *
   * ## What "still owes" means, exactly
   *
   * Three conditions, and each is the domain's own rather than a guess:
   *
   * - **assigned to this coach** — `TrialCoach`, the same row `recordVerdict`
   *   checks before it will accept a verdict. A coach who is not on the session
   *   cannot write one, so it must not be in their queue.
   * - **APPLIED or CONFIRMED** — the two states `recordVerdict` accepts, which
   *   is also exactly "no verdict yet": writing one moves the row to PASSED or
   *   FAILED. Querying `status != 'PASSED'` instead would drag in every
   *   rejection and failure the coach has already settled.
   * - **nothing about the trial's own status.** Deliberate: `recordVerdict` does
   *   not check it either, so an archived session with players still unanswered
   *   is work the coach can do — and filtering it out here would hide work while
   *   leaving the endpoint that performs it open.
   *
   * ## Both kinds of trial belong here
   *
   * This is an action queue, not a catalogue. A general trial's applicant and a
   * private trial's confirmed invitee are the same job — stand on a pitch and
   * decide — so both appear, and each row says which kind it is so the coach
   * knows which flow they are in.
   *
   * The player and the trial come back on the row rather than being fetched per
   * card, so a page of twenty costs one query and not forty-one.
   */
  async listPendingForCoach(userId: string, { page = 1, pageSize = 12 } = {}) {
    // Both kinds: the assigned coach decides a global trial's applicants and a
    // private trial's invitee alike (TRIAL.md §10).
    const where: Prisma.TrialApplicationWhereInput = {
      status: { in: ['APPLIED', 'CONFIRMED'] },
      trial: { coaches: { some: { coachUserId: userId } } },
    };

    const [items, total] = await Promise.all([
      this.prisma.trialApplication.findMany({
        where,
        orderBy: [{ trial: { date: 'asc' } }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          createdAt: true,
          trial: {
            select: {
              id: true,
              title: true,
              type: true,
              date: true,
              endDate: true,
              startTime: true,
              endTime: true,
              location: true,
            },
          },
          player: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              birthDate: true,
              primaryPosition: true,
              secondaryPosition: true,
              dominantFoot: true,
              region: true,
              user: { select: { avatarKey: true } },
            },
          },
        },
      }),
      this.prisma.trialApplication.count({ where }),
    ]);

    return {
      items: items.map(({ player, ...application }) => {
        const { user, ...profile } = player;
        return {
          ...application,
          player: { ...profile, avatarUrl: this.storage.publicUrlOrNull(user?.avatarKey) },
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async listForCoach(userId: string) {
    const rows = await this.prisma.trialCoach.findMany({
      where: { coachUserId: userId },
      include: { trial: true },
      orderBy: { trial: { date: 'asc' } },
    });
    if (rows.length === 0) return [];

    const trialIds = rows.map((row) => row.trialId);
    // Two independent counts, so `Promise.all` rather than `$transaction`: there
    // is no invariant between them to protect, and the array form of
    // `$transaction` loses Prisma's `groupBy` result typing.
    const [applicants, awaiting] = await Promise.all([
      this.prisma.trialApplication.groupBy({
        by: ['trialId'],
        where: { trialId: { in: trialIds } },
        _count: { _all: true },
      }),
      // APPLIED and CONFIRMED are exactly the states a verdict can be written
      // from — recording one moves the row to PASSED or FAILED, so "still in one
      // of these" and "still waiting on me" are the same set.
      this.prisma.trialApplication.groupBy({
        by: ['trialId'],
        where: {
          trialId: { in: trialIds },
          status: { in: ['APPLIED', 'CONFIRMED'] },
        },
        _count: { _all: true },
      }),
    ]);

    const applicantOf = new Map(applicants.map((row) => [row.trialId, row._count._all]));
    const awaitingOf = new Map(awaiting.map((row) => [row.trialId, row._count._all]));

    return rows.map((row) => ({
      ...row.trial,
      applicantCount: applicantOf.get(row.trialId) ?? 0,
      awaitingVerdict: awaitingOf.get(row.trialId) ?? 0,
    }));
  }

  /**
   * The public board.
   *
   * General trials only. A private trial is a session for one named child; it
   * reaches that child through an invitation, and listing it here would make the
   * academy's interest public before the family had answered.
   */
  async listUpcoming(query: ListTrialsQueryDto = {}, viewerUserId?: string) {
    /*
     * The filters go in the query; only the ranking happens in memory.
     *
     * Region, district and position narrow the set the database returns, so a
     * player filtering to one province is not sent every trial in the country to
     * discard on their phone. Age cannot: it is a *range* on the trial compared
     * against one number, and expressing "12 is inside [min,max], or the trial
     * states no range" as a Prisma filter is possible but reads far worse than
     * the predicate it duplicates — so age filters after the fetch, over a set
     * the other three have already narrowed.
     */
    const trials = await this.prisma.trial.findMany({
      where: {
        status: 'OPEN',
        type: 'GENERAL',
        // See `list`: a dateless trial runs until it is archived.
        OR: [{ date: null }, { date: { gte: new Date() } }],
        ...(query.region ? { academy: { region: query.region } } : {}),
        ...(query.district ? { academy: { district: query.district } } : {}),
        // A trial that names no positions wants anybody, so it stays in the list
        // whatever is filtered for — filtering it out would hide the trials most
        // open to the person doing the filtering.
        ...(query.position
          ? { OR: [{ positions: { has: query.position } }, { positions: { isEmpty: true } }] }
          : {}),
      },
      include: { academy: { select: TrialsService.ACADEMY_SUMMARY } },
    });

    const byAge =
      query.age === undefined
        ? trials
        : trials.filter((trial) => matchesAge(trial, query.age ?? null));

    /*
     * `recommended` needs a player to recommend *to*.
     *
     * A signed-out visitor, or an account with no player card, has no age, no
     * position and no location — so there is nothing to rank against and the
     * order would be arbitrary under a label promising otherwise. It falls back
     * to newest, which is honest and is what they would have got anyway.
     */
    const viewer = query.sort === 'recommended' ? await this.viewerProfile(viewerUserId) : null;

    const ordered = viewer
      ? byAge.sort((a, b) => compareRecommended(a, b, viewer))
      : byAge.sort(compareNewest);

    return ordered.map((trial) => this.withCoverUrl(trial));
  }

  /**
   * The player behind the request, as the ranking needs them.
   *
   * Location comes from the player's own region/district resolved to a point,
   * because a player profile stores a place by name rather than by coordinates —
   * the academy is the end that has a precise position, and "which province are
   * you in" is as much as the platform asks a fourteen-year-old for.
   *
   * Returns null when there is nobody to rank for, which is what makes the
   * caller fall back to newest.
   */
  private async viewerProfile(userId?: string): Promise<ViewerProfile | null> {
    if (!userId) return null;

    const player = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: {
        birthDate: true,
        primaryPosition: true,
        secondaryPosition: true,
        region: true,
        district: true,
      },
    });
    if (!player) return null;

    const point = regionCentre(player.region, player.district);

    return {
      age: ageAt(player.birthDate, new Date()),
      positions: [player.primaryPosition, player.secondaryPosition].filter(
        (position): position is string => Boolean(position),
      ),
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
    };
  }

  /**
   * One trial, if the caller is allowed to know it exists.
   *
   * A general trial is public. A private one is readable by the academy that
   * runs it, the coaches working it, and the player it concerns — and a 404 for
   * everyone else, because "403 Forbidden" on a trial for one named child still
   * tells the reader that child is being looked at.
   */
  async getVisibleById(trialId: string, userId?: string) {
    const trial = await this.getById(trialId);
    if (trial.type === 'GENERAL') return trial;
    if (!userId) throw new NotFoundException('Trial not found');

    /*
     * A coach reaches a private trial by being assigned to it, not by working
     * for the academy.
     *
     * `role: { in: ['MANAGER', 'COACH'] }` here let every coach on the staff
     * read every private trial — which is what TrialCoach's own note calls out
     * as the thing to avoid: it makes the private ones public within the
     * building. A session about one named child is for the people running it.
     */
    const [staff, coach, application] = await Promise.all([
      this.prisma.academyMember.findFirst({
        where: { userId, academyId: trial.academyId, role: 'MANAGER' },
        select: { id: true },
      }),
      this.prisma.trialCoach.findFirst({ where: { trialId, coachUserId: userId } }),
      this.prisma.trialApplication.findFirst({
        where: { trialId, player: { userId } },
        select: { id: true },
      }),
    ]);
    if (!staff && !coach && !application) throw new NotFoundException('Trial not found');
    return trial;
  }

  /**
   * Name the coaches working this trial.
   *
   * They must already work for the academy: a coach's standing here is the
   * academy's endorsement of them (§1.5.3), and assigning an outsider would let
   * a trial manufacture the credential the platform is supposed to check.
   */
  async assignCoaches(userId: string, trialId: string, coachUserIds: string[]) {
    const trial = await this.getById(trialId);
    await this.assertAcademyManager(userId, trial.academyId);

    const endorsed = await this.prisma.academyEndorsement.findMany({
      where: {
        academyId: trial.academyId,
        role: 'COACH',
        status: 'ACTIVE',
        userId: { in: coachUserIds },
      },
      select: { userId: true },
    });
    if (endorsed.length !== coachUserIds.length) {
      throw new BadRequestException('One of those coaches does not work for this academy');
    }

    await this.prisma.$transaction([
      this.prisma.trialCoach.deleteMany({ where: { trialId } }),
      this.prisma.trialCoach.createMany({
        data: coachUserIds.map((coachUserId) => ({ trialId, coachUserId })),
      }),
    ]);

    return this.listCoaches(trialId);
  }

  async listCoaches(trialId: string) {
    const rows = await this.prisma.trialCoach.findMany({
      where: { trialId },
      include: {
        coachUser: { select: { id: true, firstName: true, lastName: true, username: true } },
      },
    });
    return rows.map((row) => row.coachUser);
  }

  /**
   * The player's answer — the only step nobody else can take for them.
   *
   * A yes is what puts them on the sheet for the day; a no closes the
   * application rather than leaving the academy waiting on somebody who has
   * already decided.
   */
  async respondToInvitation(userId: string, applicationId: string, accept: boolean) {
    const application = await this.prisma.trialApplication.findUnique({
      where: { id: applicationId },
      include: { player: { select: { userId: true } }, trial: true },
    });
    if (!application) throw new NotFoundException('Trial application not found');
    if (application.player.userId !== userId) {
      throw new ForbiddenException('That invitation was not addressed to you');
    }
    if (application.status !== 'INVITED') {
      throw new BadRequestException('You have already answered this invitation');
    }

    const updated = await this.prisma.trialApplication.update({
      where: { id: applicationId },
      data: { status: accept ? 'CONFIRMED' : 'REJECTED' },
    });

    // What follows a yes is the trial itself; its verdict is `recordVerdict`.

    const manager = await this.prisma.academyMember.findFirst({
      where: { academyId: application.trial.academyId, role: 'MANAGER' },
      select: { userId: true },
    });
    if (manager) {
      await this.notifications.notify(
        manager.userId,
        'TRIAL_RESULT',
        {
          applicationId,
          trialId: application.trialId,
          trialTitle: application.trial.title,
          status: updated.status,
        },
        { userId, role: 'player' },
      );
    }

    return updated;
  }

  /**
   * The coach's verdict, after testing the player in person — TRIAL.md Rules 4, 7.
   *
   * The one place PASS and FAIL are written, and the only thing that can reach a
   * squad (Rule 8). It answers one question — did they pass the football
   * examination — and nothing else on the platform answers it (§1.2).
   *
   * ## What a verdict settles
   *
   * Both outcomes move every backing scout's reputation, because both are
   * finalized outcomes (§28) and a player rarely arrives on one scout's word.
   * Only a PASS clears the player's recommendations (Rule 13) — a FAIL is an
   * answer about one morning, not a reason to wipe the record of who spotted
   * them.
   *
   * Neither outcome places anybody. That is `addToSquad`, and it is the
   * manager's (Rule 9).
   */
  async recordVerdict(userId: string, applicationId: string, dto: RecordTrialVerdictDto) {
    const application = await this.prisma.trialApplication.findUnique({
      where: { id: applicationId },
      include: {
        trial: { include: { academy: { select: { kind: true } } } },
        player: {
          select: {
            id: true,
            userId: true,
            firstName: true,
            lastName: true,
            // For the SMS on a pass. Optional on an account, so it is often null.
            user: { select: { phone: true } },
          },
        },
        result: { select: { id: true } },
      },
    });
    if (!application) throw new NotFoundException('Trial application not found');

    /*
     * Only a coach assigned to this trial answers — TRIAL.md §10, Rule 10.
     *
     * Global or private, the same rule: the coach was on the pitch with the
     * player, and the manager was not. A manager who is also an assigned coach
     * decides as that coach; a manager who is not decides nothing, and their
     * part begins when a PASS lands on their dashboard (§12).
     */
    const assigned = await this.prisma.trialCoach.findUnique({
      where: { trialId_coachUserId: { trialId: application.trialId, coachUserId: userId } },
    });
    if (!assigned) {
      throw new ForbiddenException('Only a coach assigned to this trial can record its verdict');
    }
    const coachProfile = await this.prisma.coachProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!coachProfile) throw new BadRequestException('That coach has no coach profile');
    const coachProfileId = coachProfile.id;

    // A trial answers once. A second look is a second trial, with its own
    // application and its own verdict.
    if (application.result) {
      throw new BadRequestException('This player has already been given a verdict');
    }

    /*
     * Only somebody who was expected on the day.
     *
     * `APPLIED` is the general route — the player put themselves forward and
     * turned up. `CONFIRMED` is the private one — invited, and they said yes. Anything else means the player was never on the sheet: an
     * invitation nobody answered, or an application already closed.
     */
    if (application.status !== 'APPLIED' && application.status !== 'CONFIRMED') {
      throw new BadRequestException('Only a player expected at this trial can be given a verdict');
    }

    /*
     * No attributes here. TRIAL.md Rule 22.
     *
     * A coach at the side of a pitch answers one question — did they pass — and
     * eight sliders between them and that answer is how verdicts stop being
     * recorded on the day. It is also a judgement they are not yet in a position
     * to make: one morning is enough to say PASS, not enough to fill in eight
     * attributes as though they had coached the player for a season. Those come
     * later, once the manager places the player in a group and somebody becomes
     * responsible for coaching them (Rule 21, README §1.9).
     */
    const result = await this.prisma.$transaction(async (tx) => {
      const written = await tx.trialResult.create({
        data: {
          applicationId,
          coachUserId: userId,
          coachProfileId,
          verdict: dto.verdict,
          note: dto.note ?? null,
        },
      });

      await tx.trialApplication.update({
        where: { id: applicationId },
        data: { status: dto.verdict === 'PASS' ? 'PASSED' : 'FAILED' },
      });

      return written;
    });

    /*
     * The scouts, in the order §28 sets out: clear first, then recalculate.
     *
     * Clearing does not touch the target rows the success rate is counted from,
     * so the order is not load-bearing for correctness — but the rule is written
     * that way, and a reader checking this against §28 should find it in the same
     * sequence rather than having to work out that it does not matter.
     */
    const backings = await this.backings.backingsOf(applicationId, application.recommendationId);

    if (dto.verdict === 'PASS') {
      await this.recommendations.clearPlayerRecommendations(application.playerId);
    }
    await this.recommendations.settleTrialBackings({
      recommendationIds: backings,
      academyId: application.trial.academyId,
      status: dto.verdict === 'PASS' ? 'ACCEPTED' : 'REJECTED',
      actor: { userId, role: 'coach' },
    });

    await this.notifications.notify(
      application.player.userId,
      'TRIAL_RESULT',
      {
        applicationId,
        trialId: application.trialId,
        trialTitle: application.trial.title,
        status: dto.verdict === 'PASS' ? 'PASSED' : 'FAILED',
        verdict: dto.verdict,
        note: dto.note ?? null,
      },
      { userId, role: 'coach' },
    );

    /*
     * The manager hears about a pass, and only a pass.
     *
     * A PASS is the one verdict that asks something of them — the player is now
     * eligible for a squad place and nobody else can give it. A FAIL asks
     * nothing: it is the coach's judgement, complete on its own, and forwarding
     * every one of them would bury the handful that need an answer under a
     * running commentary on a morning the manager did not attend.
     *
     * The whole sheet is still on the trial's own screen either way.
     */
    if (dto.verdict === 'PASS') {
      const manager = await this.prisma.academyMember.findFirst({
        where: { academyId: application.trial.academyId, role: 'MANAGER' },
        select: { userId: true },
      });
      if (manager) {
        await this.notifications.notify(
          manager.userId,
          'TRIAL_RESULT',
          {
            applicationId,
            trialId: application.trialId,
            trialTitle: application.trial.title,
            playerId: application.playerId,
            playerName: `${application.player.firstName} ${application.player.lastName}`,
            status: 'PASSED',
            verdict: 'PASS',
          },
          { userId, role: 'coach' },
        );
      }
    }

    /*
     * The player hears about a pass on their phone, not only in the app.
     *
     * SMS is the channel this market reads: a fourteen-year-old who was at a
     * trial on Saturday morning may not open the app again for a week, and "you
     * passed" is the one message worth the cost of reaching them where they are.
     * A fail is not sent — a rejection delivered by text to a child, with no
     * context and no way to reply, is the wrong medium for that news.
     *
     * Only an academy. A local team holds no trials at all (LOCAL_TEAM.md §8,
     * enforced at creation by `assertNotLocalTeam`), so this branch should be
     * unreachable for one — the check is here anyway because it states the rule
     * where the money is spent rather than three services away.
     *
     * Not awaited, and it cannot throw: a verdict a coach recorded on a pitch
     * must not roll back because a gateway timed out, and the player's squad
     * place must not wait on an HTTP call to a third party. `SmsService` returns
     * its failures instead of raising them, which is what makes this safe.
     */
    if (dto.verdict === 'PASS' && !isLocalTeam(application.trial.academy.kind)) {
      void this.sms
        .sendTrialPass({
          phone: application.player.user?.phone,
          trialId: application.trialId,
          playerId: application.playerId,
        })
        /*
         * `SmsService` returns its failures rather than raising them, so this
         * should never run — and it is here precisely because "should never" is
         * not a guarantee for an un-awaited promise. An unhandled rejection in
         * Node takes the whole process down, which would turn a gateway
         * misconfiguration into an outage of the entire API.
         */
        .catch((error: Error) => {
          this.logger.error(`Trial-pass SMS threw for ${application.playerId}: ${error.message}`);
        });
    }

    // The player's cached profile now has a new assessment on it.
    await this.redis.del(RedisKeys.playerProfile(application.playerId));

    return result;
  }

  /**
   * The end of the road: the academy takes the player on.
   *
   * It sends an invitation to join rather than writing the membership directly.
   * A trial is strong evidence of mutual interest, but joining an academy is
   * still the player's yes to give — the same rule every other route into a
   * squad follows, and the same screen the player already answers it on.
   *
   * The gate is a trial PASS and nothing else (Rule 8). Nothing decided from a
   * profile can stand in for it, because nothing is decided from a profile
   * (§1.2).
   *
   * The scouts are already settled by then: their call was answered by the coach
   * on the day, not by this administrative step (§28).
   */
  async addToSquad(userId: string, applicationId: string) {
    const application = await this.prisma.trialApplication.findUnique({
      where: { id: applicationId },
      include: { trial: true, player: { select: { userId: true } } },
    });
    if (!application) throw new NotFoundException('Trial application not found');
    await this.assertAcademyManager(userId, application.trial.academyId);

    if (application.status !== 'PASSED') {
      throw new BadRequestException('A coach has to pass this player at the trial first');
    }

    const invitation = await this.invitations.invite(userId, application.trial.academyId, {
      userId: application.player.userId,
      role: 'PLAYER',
      note: `${application.trial.title} — ${application.trial.location}`,
    });

    await this.prisma.trialApplication.update({
      where: { id: applicationId },
      data: { status: 'ACCEPTED' },
    });

    /*
     * The news, separate from the paperwork.
     *
     * `invitations.invite` already notifies — with an academy join invitation
     * awaiting a yes. That is a form. A fourteen-year-old who trained for this,
     * turned up and passed should also be told plainly that they passed and the
     * academy wants them, in words that are about them rather than about a
     * membership record.
     */
    await this.notifications.notify(
      application.player.userId,
      'SQUAD_PLACEMENT',
      {
        applicationId,
        trialId: application.trialId,
        trialTitle: application.trial.title,
        academyId: application.trial.academyId,
      },
      { userId, role: 'academy_manager' },
    );

    return invitation;
  }

  /**
   * Change a published trial, or close it.
   *
   * There is no delete. Every application attached to a trial is a decision
   * somebody made about a child, and a row that vanishes takes that record with
   * it — so a trial that will not happen is ARCHIVED, which stops applications
   * and hides it from the public list while the academy keeps the history.
   */
  async update(userId: string, trialId: string, dto: UpdateTrialDto) {
    const trial = await this.getById(trialId);
    await this.assertAcademyManager(userId, trial.academyId);

    const ageRangeMin = dto.ageRangeMin ?? trial.ageRangeMin;
    const ageRangeMax = dto.ageRangeMax ?? trial.ageRangeMax;
    // Both null on a private trial, which has no eligibility rules to order.
    if (ageRangeMin != null && ageRangeMax != null && ageRangeMin > ageRangeMax) {
      throw new BadRequestException('The minimum age cannot be above the maximum');
    }

    /*
     * Each field falls back to what the trial already holds, so a partial edit
     * cannot silently drop the other half of the window — changing only the end
     * time must not blank the dates.
     */
    const date = patchedDate(dto.date, trial.date);
    const endDate = patchedDate(dto.endDate, trial.endDate);
    const startTime = dto.startTime !== undefined ? (dto.startTime ?? null) : trial.startTime;
    const endTime = dto.endTime !== undefined ? (dto.endTime ?? null) : trial.endTime;
    const applyDeadline = patchedDate(dto.applyDeadline, trial.applyDeadline);

    this.assertWindow({ startsAt: date, endsAt: endDate, startTime, endTime, applyDeadline });

    const coverKey =
      dto.coverKey !== undefined
        ? this.assertOwnCoverKey(trial.academyId, dto.coverKey)
        : trial.coverKey;

    /*
     * Compared before the write, because afterwards there is nothing to compare
     * against. Both sides must exist: giving a date to a trial that never had
     * one is not a reschedule — nobody was told a date to be moved from — so it
     * announces nothing.
     */
    const moved =
      dto.date !== undefined &&
      trial.date !== null &&
      date !== null &&
      date.getTime() !== trial.date.getTime();

    const updated = await this.prisma.trial.update({
      where: { id: trialId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.location !== undefined ? { location: dto.location.trim() } : {}),
        ...(dto.date !== undefined ? { date } : {}),
        ...(dto.endDate !== undefined ? { endDate } : {}),
        ...(dto.startTime !== undefined ? { startTime } : {}),
        ...(dto.endTime !== undefined ? { endTime } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.coverKey !== undefined ? { coverKey } : {}),
        ...(dto.seoKeywords !== undefined
          ? { seoKeywords: normaliseKeywords(dto.seoKeywords) }
          : {}),
        ...(dto.applyDeadline !== undefined ? { applyDeadline } : {}),
        ...(dto.ageRangeMin !== undefined ? { ageRangeMin: dto.ageRangeMin } : {}),
        ...(dto.ageRangeMax !== undefined ? { ageRangeMax: dto.ageRangeMax } : {}),
        ...(dto.positions !== undefined ? { positions: dto.positions } : {}),
        ...(dto.requirements !== undefined
          ? { requirements: dto.requirements.trim() || null }
          : {}),
        ...(dto.note !== undefined ? { note: sanitizeRichText(dto.note) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });

    // `moved` is only true when both dates exist, so the non-null assertion the
    // signature would otherwise need is already established above.
    if (moved && trial.date) {
      await this.announceReschedule(updated, trial.date, { userId, role: 'academy_manager' });
    }

    return this.withCoverUrl(updated);
  }

  /**
   * Tell everybody holding an application that the exam moved.
   *
   * The date is the one detail of a trial a family arranges their week around,
   * so changing it quietly is the single edit that can waste somebody's morning.
   * Both dates go in the payload: "it moved" without saying from what leaves the
   * reader checking whether they had remembered it wrong.
   *
   * Everyone still in play, which excludes the rejected and those already given
   * a verdict — their trial is over and the new date is not about them.
   */
  private async announceReschedule(
    trial: { id: string; title: string; date: Date | null },
    was: Date,
    actor: { userId: string; role: string },
  ) {
    const applications = await this.prisma.trialApplication.findMany({
      where: {
        trialId: trial.id,
        status: { in: ['APPLIED', 'INVITED', 'CONFIRMED'] },
      },
      select: { id: true, player: { select: { userId: true } } },
    });

    for (const application of applications) {
      await this.notifications.notify(
        application.player.userId,
        'TRIAL_RESCHEDULED',
        {
          applicationId: application.id,
          trialId: trial.id,
          trialTitle: trial.title,
          // Non-null by construction: `update` only announces when both the old
          // and the new date exist (see `moved`).
          date: trial.date?.toISOString() ?? null,
          previousDate: was.toISOString(),
        },
        actor,
      );
    }
  }

  async getById(trialId: string) {
    const trial = await this.prisma.trial.findUnique({
      where: { id: trialId },
      include: { academy: { select: TrialsService.ACADEMY_SUMMARY } },
    });
    if (!trial) throw new NotFoundException('Trial not found');
    return this.withCoverUrl(trial);
  }

  /**
   * A player applies to a general trial, and that is the whole of it.
   *
   * No screening of any kind — TRIAL.md §1.2. A general trial is the open day:
   * the academy announced it, the player put themselves forward, and the next
   * thing that happens is a coach watching them play. Screening the profile first
   * would make the open day something a player could be turned away from without
   * anyone seeing them kick a ball, which is the opposite of what it is for.
   *
   * The backings are still snapshotted, because the trial's verdict is what
   * settles every scout who put this player forward (§28).
   */
  async apply(userId: string, trialId: string) {
    const player = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!player) throw new ForbiddenException('Only players can apply to trials');

    const trial = await this.getById(trialId);
    if (trial.status === 'ARCHIVED') {
      throw new BadRequestException('This trial is closed to new applications');
    }
    if (trial.type === 'PRIVATE') {
      throw new BadRequestException('This trial is by invitation only');
    }

    /*
     * Past the deadline the trial is readable but not applicable.
     *
     * Not hidden: a player who hears about it the day after should be able to
     * see what they missed and when the next one is, rather than meet a 404 that
     * tells them nothing. The button is simply gone.
     */
    if (trial.applyDeadline && trial.applyDeadline < new Date()) {
      throw new BadRequestException('Applications for this trial have closed');
    }

    // Who the trial is for. Before the age check and before any write: a
    // refusal here leaves no application, no snapshot and no notification.
    // The same rule guards the manager's invitation — see trial-eligibility.util.
    assertGenderEligible(trial, player);

    /*
     * Only a trial that states a range can turn somebody away on age. A private
     * trial states none — nobody applies to one, so there is nothing to check.
     */
    const age = ageAt(player.birthDate, ageReferenceDate(trial));
    if (
      trial.ageRangeMin != null &&
      trial.ageRangeMax != null &&
      (age < trial.ageRangeMin || age > trial.ageRangeMax)
    ) {
      throw new BadRequestException(
        `Player age (${age}) is outside the trial's age range (${trial.ageRangeMin}-${trial.ageRangeMax})`,
      );
    }

    const application = await this.prisma.trialApplication.upsert({
      where: { trialId_playerId: { trialId, playerId: player.id } },
      update: {},
      create: { trialId, playerId: player.id },
    });

    await this.backings.snapshotBackings(application.id, player.id, trial.academyId);

    return application;
  }

  async listMyApplications(userId: string) {
    const player = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!player) throw new ForbiddenException('Only players have trial applications');
    return this.prisma.trialApplication.findMany({
      where: { playerId: player.id },
      include: { trial: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Who is coming, and what has been decided about them.
   *
   * Readable by the manager *and* by the coaches working the trial — a coach who
   * cannot list the applicants has no way to reach the one they just watched.
   * The verdict comes back on the row with the applicant, so the sheet reads
   * as one thing: who came, and what was decided.
   */
  async listApplicationsForTrial(userId: string, trialId: string) {
    const trial = await this.getById(trialId);

    const [membership, coaching] = await Promise.all([
      this.prisma.academyMember.findUnique({
        where: { academyId_userId: { academyId: trial.academyId, userId } },
      }),
      this.prisma.trialCoach.findUnique({
        where: { trialId_coachUserId: { trialId, coachUserId: userId } },
      }),
    ]);
    if (membership?.role !== 'MANAGER' && !coaching) {
      throw new ForbiddenException('Only this academy or a coach working this trial can see that');
    }

    /*
     * The player's photograph comes with them.
     *
     * `avatarKey` lives on the account rather than the profile, so a bare
     * `player: true` returns a card with no face on it — and the applicant grid
     * a coach scans is built around the face. Flattened to `avatarUrl` below,
     * the same shape `PlayersService` returns, so the client has one field to
     * read rather than a key it would have to know how to turn into a URL.
     */
    const applications = await this.prisma.trialApplication.findMany({
      where: { trialId },
      include: {
        player: { include: { user: { select: { avatarKey: true } } } },
        result: {
          select: {
            id: true,
            verdict: true,
            note: true,
            decidedAt: true,
            coachUser: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return applications.map(({ player, ...application }) => {
      const { user, ...profile } = player;
      return {
        ...application,
        player: { ...profile, avatarUrl: this.storage.publicUrlOrNull(user?.avatarKey) },
      };
    });
  }

  /**
   * The academy withdrawing its interest.
   *
   * The only status a manager may write directly. It used to accept SHORTLISTED,
   * INVITED and ACCEPTED too, which made every gate optional — see
   * `UpdateTrialApplicationStatusDto` for why each of those is a coach's call
   * and not a manager's.
   */
  async updateApplicationStatus(
    userId: string,
    applicationId: string,
    dto: UpdateTrialApplicationStatusDto,
  ) {
    const application = await this.prisma.trialApplication.findUnique({
      where: { id: applicationId },
      include: { trial: true, player: true },
    });
    if (!application) throw new NotFoundException('Trial application not found');

    await this.assertAcademyManager(userId, application.trial.academyId);

    const updated = await this.prisma.trialApplication.update({
      where: { id: applicationId },
      data: { status: dto.status },
    });

    await this.notifications.notify(
      application.player.userId,
      'TRIAL_RESULT',
      { applicationId, trialId: application.trialId, status: dto.status },
      { userId, role: 'academy_manager' },
    );

    return updated;
  }

  /**
   * Attaches the cover's public URL, the same way the academy gallery does.
   *
   * The key is what is stored and the URL is built at read time (storage.keys.ts):
   * a stored URL outlives every decision that produced it, so changing CDN,
   * domain or provider would be a migration rather than a config change.
   *
   * `coverKey` is left on the object rather than stripped — an academy manager
   * editing a trial sends it straight back, and hiding it would mean the edit
   * form could not preserve a cover it did not re-upload.
   */
  private withCoverUrl<T extends { coverKey: string | null; academy?: AcademySummaryRow }>(
    trial: T,
  ) {
    const { academy, ...rest } = trial;
    return {
      ...rest,
      coverUrl: this.storage.publicUrlOrNull(trial.coverKey),
      /*
       * The host, for the screens that show a trial on its own.
       *
       * A player looking at a trial is deciding whether to travel to it, and
       * "who is running this and where are they" is most of that decision. It
       * used to take a second request to `/academies/:id` — or, on the list, was
       * simply absent, so every card said only which town the *session* was in.
       *
       * `logoKey` becomes `logoUrl` here for the same reason it does on the
       * academy's own endpoint: the key is what is stored, and the URL is built
       * at read time so changing CDN or provider stays a config change.
       */
      academy: academy
        ? {
            id: academy.id,
            name: academy.name,
            region: academy.region,
            district: academy.district,
            // Nullable together and always read together — half a pair points at
            // the Gulf of Guinea (see the schema note).
            latitude: academy.latitude,
            longitude: academy.longitude,
            logoUrl: this.storage.publicUrlOrNull(academy.logoKey),
          }
        : undefined,
    };
  }

  /** The academy fields a trial carries. Deliberately not the whole profile. */
  private static readonly ACADEMY_SUMMARY = {
    id: true,
    name: true,
    region: true,
    district: true,
    latitude: true,
    longitude: true,
    logoKey: true,
  } as const;

  private assertWindow(window: Parameters<typeof validateWindow>[0]): void {
    const problem = validateWindow(window);
    if (!problem) return;

    const messages: Record<NonNullable<typeof problem>, string> = {
      'time-without-date': 'An open-ended trial cannot carry dates or times',
      'partial-time': 'Give both a start time and an end time, or neither',
      'end-before-start': 'The trial cannot end before it starts',
      'end-time-before-start-time': 'The daily end time must be after the start time',
      'deadline-after-start': 'Applications cannot close after the trial has started',
    };
    throw new BadRequestException(messages[problem]);
  }

  /**
   * Accepts a cover key only if it names this academy's own directory.
   *
   * The key comes from `POST /academies/:id/images/upload-url`, which mints it
   * server-side — but this endpoint takes it back from the client, and a caller
   * who could name any key could point a trial's cover at another academy's
   * private object and have it served under their own trial. `assertKeyUnder`
   * is the same guard the academy gallery uses.
   *
   * `null` or an empty string clears the cover, which is how the form removes
   * one — an edit that took the picture off has to say so, since PATCH reads an
   * absent field as "leave it alone".
   */
  private assertOwnCoverKey(academyId: string, key: string | null | undefined): string | null {
    const trimmed = (key ?? '').trim();
    if (!trimmed) return null;
    assertKeyUnder(trimmed, academyMediaPrefix(academyId));
    return trimmed;
  }

  private async assertAcademyManager(userId: string, academyId: string) {
    const membership = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId, userId } },
    });
    if (!membership || membership.role !== 'MANAGER') {
      throw new ForbiddenException('Only the academy manager can perform this action');
    }
    return membership;
  }
}
