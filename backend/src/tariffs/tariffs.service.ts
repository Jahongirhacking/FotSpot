import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PlanTier, Prisma, TariffPlan } from '@prisma/client';
import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTariffPlanDto } from './dto/tariff.dto';

/** The three tiers, in the order the admin screen shows them. */
export const PLAN_TIERS: readonly PlanTier[] = ['FREE', 'PRO', 'PREMIUM'];

/**
 * What a limit check answers: the ceiling, what is already used, and whether
 * there is room. Returned whole rather than as a bare boolean so a screen can
 * say "9 of 10 used" *before* the user tries, which is the difference between a
 * limit and a surprise.
 */
export interface Quota {
  limit: number;
  used: number;
  remaining: number;
  exceeded: boolean;
}

function quota(used: number, limit: number): Quota {
  return { limit, used, remaining: Math.max(0, limit - used), exceeded: used >= limit };
}

/**
 * Plan limits, and every check that reads one.
 *
 * ## Why the checks live here and not in the four services they guard
 *
 * `MediaService`, `RecommendationsService`, `AcademiesService` and
 * `GroupsService` each own one act. What a plan permits is one subject spread
 * across all four, and the counting query for each limit is bound to the *limit*
 * rather than to the act — "how many clips in the window" is the definition of
 * the clip limit, not a detail of uploading.
 *
 * Keeping them together means the screen that shows remaining quota and the code
 * that refuses at the boundary read the same method, so a badge saying "1 left"
 * and an upload that is refused cannot disagree.
 *
 * ## Plans are read, never created
 *
 * The three rows are seeded and the tier is their primary key, so every read is
 * a lookup that must succeed. A missing row is a broken deployment (the seed did
 * not run), not a case to paper over with defaults — defaults invented here would
 * quietly diverge from what the admin screen shows.
 */
@Injectable()
export class TariffsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** All three plans, cheapest first — the shape /admin/tariff-plans renders. */
  async list(): Promise<TariffPlan[]> {
    const plans = await this.prisma.tariffPlan.findMany();
    return PLAN_TIERS.map((tier) => plans.find((plan) => plan.tier === tier)).filter(
      (plan): plan is TariffPlan => !!plan,
    );
  }

  /** Super admin edits one tier's numbers. Tiers are never created or deleted. */
  async update(actorId: string, tier: PlanTier, dto: UpdateTariffPlanDto): Promise<TariffPlan> {
    const data: Prisma.TariffPlanUpdateInput = {
      ...(dto.clipLimit !== undefined ? { clipLimit: dto.clipLimit } : {}),
      ...(dto.clipWindowDays !== undefined ? { clipWindowDays: dto.clipWindowDays } : {}),
      ...(dto.pendingRecommendationLimit !== undefined
        ? { pendingRecommendationLimit: dto.pendingRecommendationLimit }
        : {}),
      ...(dto.maxCoaches !== undefined ? { maxCoaches: dto.maxCoaches } : {}),
      ...(dto.maxGroups !== undefined ? { maxGroups: dto.maxGroups } : {}),
    };

    const plan = await this.prisma.tariffPlan
      .update({ where: { tier }, data })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          throw new NotFoundException(`Tariff plan ${tier} is missing from this deployment`);
        }
        throw error;
      });

    await this.audit.record(actorId, AuditAction.TARIFF_PLAN_UPDATED, { tier, ...data });
    return plan;
  }

  /**
   * The plan a user is on.
   *
   * Read through the user rather than taken from a passed-in tier: the JWT is a
   * login-time snapshot (backend/CLAUDE.md §7) and a plan change must bite on the
   * next request, not on the next sign-in. A user who was downgraded mid-session
   * should not keep the old ceiling for an hour.
   */
  async planFor(userId: string): Promise<TariffPlan> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user.plan;
  }

  /** Super admin moves an account between tiers — the only way a plan changes. */
  async setUserPlan(actorId: string, userId: string, tier: PlanTier) {
    const user = await this.prisma.user
      .update({
        where: { id: userId },
        data: { planTier: tier },
        select: { id: true, planTier: true },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          throw new NotFoundException('User not found');
        }
        throw error;
      });

    await this.audit.record(actorId, AuditAction.USER_PLAN_CHANGED, { userId, tier });
    return user;
  }

  // ---------- The limits ----------

  /**
   * A — clips uploaded inside the last B days.
   *
   * A rolling window, so the count is "since now minus B days" rather than a
   * bucket that empties on a fixed date. Removed clips still count: deleting the
   * evidence and re-uploading would otherwise make the limit optional, and the
   * cost the limit exists to bound (the upload itself) has already been paid.
   */
  async clipQuota(userId: string): Promise<Quota & { windowDays: number; resetsAt: Date | null }> {
    const plan = await this.planFor(userId);
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    const since = windowStart(plan.clipWindowDays);
    const used = profile
      ? await this.prisma.media.count({
          where: { playerId: profile.id, createdAt: { gte: since } },
        })
      : 0;

    // When the oldest clip in the window ages out, one slot comes back. That is
    // the honest answer to "when can I upload again" — a window that resets all
    // at once would be a different limit.
    const oldest =
      used >= plan.clipLimit && profile
        ? await this.prisma.media.findFirst({
            where: { playerId: profile.id, createdAt: { gte: since } },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          })
        : null;

    return {
      ...quota(used, plan.clipLimit),
      windowDays: plan.clipWindowDays,
      resetsAt: oldest ? addDays(oldest.createdAt, plan.clipWindowDays) : null,
    };
  }

  async assertCanUploadClip(userId: string) {
    const q = await this.clipQuota(userId);
    if (!q.exceeded) return q;
    throw new ForbiddenException(
      `Your plan allows ${q.limit} clip${q.limit === 1 ? '' : 's'} every ${q.windowDays} days, and you have used them all. ` +
        (q.resetsAt
          ? `You can upload again on ${q.resetsAt.toISOString().slice(0, 10)}.`
          : 'Upgrade your plan to upload more.'),
    );
  }

  /**
   * C — players this scout has put forward and is still owed an answer about.
   *
   * ## One player, one slot
   *
   * Counted per recommendation, not per target academy: what is being limited is
   * how many players a scout may have in the air at once. A SPECIFIC
   * recommendation naming three academies is still one player they are vouching
   * for, and charging it three slots would punish the scout for being thorough
   * about who should see them.
   *
   * ## A slot is held by an *undecided target*, not by the status column
   *
   * `Recommendation.status` is only mirrored from the verdict when there is
   * exactly one target academy (`settleTarget`'s `soleTarget`). Reading it
   * directly would leave a three-academy recommendation counted as pending for
   * ever after all three had answered — a slot the scout could never get back.
   *
   * So the question is asked of the target rows, which is where a decision
   * actually lands: at least one academy still owes an answer.
   *
   * ## GLOBAL recommendations are free
   *
   * They have no targets, because they are addressed to nobody (§1.5.3). Nobody
   * owes an answer, so no answer can ever arrive to release the slot — counting
   * them would let a scout permanently lock themselves out by doing something
   * useful. This is the same reason §1.5 keeps them out of the success-rate
   * denominator, and the denominator is counted from these same target rows.
   *
   * `clearedAt` still excludes a recommendation whose player passed a trial and
   * was placed: their targets may never have been answered one by one, but the
   * outcome is in and it is the best one available.
   */
  async pendingRecommendationQuota(scoutId: string): Promise<Quota> {
    const plan = await this.planFor(scoutId);
    /*
     * A GLOBAL recommendation counts too, and used not to.
     *
     * `targets: { some: … }` is false for a recommendation with no targets, which
     * is exactly what a GLOBAL one is until an academy picks it up. So a scout who
     * never chose an academy consumed no slots at all — the limit this quota
     * exists to enforce could be walked straight past by leaving the dropdown
     * empty, and their card read "0/10" after filing ten.
     *
     * "Pending" means nobody has decided it yet, and nobody has decided a live
     * global. `clearedAt: null` is what already distinguishes live from finished,
     * so the second branch needs nothing else.
     */
    const used = await this.prisma.recommendation.count({
      where: {
        scoutId,
        clearedAt: null,
        OR: [
          { targets: { some: { status: { in: ['PENDING', 'REVIEWING'] } } } },
          { targets: { none: {} } },
        ],
      },
    });
    return quota(used, plan.pendingRecommendationLimit);
  }

  async assertCanRecommend(scoutId: string) {
    const q = await this.pendingRecommendationQuota(scoutId);
    if (!q.exceeded) return q;
    throw new ForbiddenException(
      `You have ${q.used} recommendation${q.used === 1 ? '' : 's'} still awaiting a verdict, and your plan allows ${q.limit} at a time. ` +
        'Wait for one to be accepted or rejected, or upgrade your plan.',
    );
  }

  /** D — coaches on this academy's books. Released members no longer count. */
  async coachQuota(managerUserId: string, academyId: string): Promise<Quota> {
    const plan = await this.planFor(managerUserId);
    const used = await this.prisma.academyMember.count({
      where: { academyId, role: 'COACH', status: { not: 'RELEASED' } },
    });
    return quota(used, plan.maxCoaches);
  }

  async assertCanAddCoach(managerUserId: string, academyId: string) {
    const q = await this.coachQuota(managerUserId, academyId);
    if (!q.exceeded) return q;
    throw new ForbiddenException(
      `Your plan allows ${q.limit} coach${q.limit === 1 ? '' : 'es'} and you already have ${q.used}. ` +
        'Release one, or upgrade your plan.',
    );
  }

  /** E — squad groups in this academy. The reserve is not a group and is free. */
  async groupQuota(managerUserId: string, academyId: string): Promise<Quota> {
    const plan = await this.planFor(managerUserId);
    const used = await this.prisma.academyGroup.count({ where: { academyId } });
    return quota(used, plan.maxGroups);
  }

  async assertCanCreateGroup(managerUserId: string, academyId: string) {
    const q = await this.groupQuota(managerUserId, academyId);
    if (!q.exceeded) return q;
    throw new ForbiddenException(
      `Your plan allows ${q.limit} squad group${q.limit === 1 ? '' : 's'} and you already have ${q.used}. ` +
        'Delete one, or upgrade your plan.',
    );
  }

  /**
   * Everything the caller's own screens need to show their headroom.
   *
   * Only the quotas their roles make meaningful: a scout has no clip limit to
   * report and a player has no coaches. Sending zeros for the rest would put
   * "0 of 5 coaches" on a fifteen-year-old's upload screen.
   *
   * Keyed on roles *held*, not the active one, because this answers "what am I
   * allowed, on this account" for a settings screen rather than authorising an
   * act. Every actual limit check still runs at the boundary of the act itself.
   */
  async myUsage(userId: string, roles: string[]) {
    const plan = await this.planFor(userId);
    const has = (role: string) => roles.includes(role);

    const academyId = has('academy_manager') ? await this.managedAcademyId(userId) : null;

    const [clips, recommendations, coaches, groups] = await Promise.all([
      has('player') ? this.clipQuota(userId) : null,
      has('scout') ? this.pendingRecommendationQuota(userId) : null,
      academyId ? this.coachQuota(userId, academyId) : null,
      academyId ? this.groupQuota(userId, academyId) : null,
    ]);

    return { plan, academyId, clips, recommendations, coaches, groups };
  }

  /**
   * The academy this user manages, if any.
   *
   * Resolved here with a direct query rather than through `AcademiesService`,
   * which already depends on this service to enforce its own limits — importing
   * it back would make the two modules mutually dependent for one id lookup.
   */
  private async managedAcademyId(userId: string): Promise<string | null> {
    const membership = await this.prisma.academyMember.findFirst({
      where: { userId, role: 'MANAGER', status: 'ACTIVE' },
      select: { academyId: true },
    });
    return membership?.academyId ?? null;
  }
}

function windowStart(days: number): Date {
  return addDays(new Date(), -days);
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
