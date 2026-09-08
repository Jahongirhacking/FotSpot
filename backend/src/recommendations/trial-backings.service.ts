import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The scouts riding on a trial.
 *
 * The seam between recommendations and trials: both sides create applications
 * — the inbox by inviting, the trial by being applied to — and every one of
 * them carries the recommendations the verdict will answer (TRIAL.md §22).
 * Nothing is decided here; this only remembers who is riding on the outcome.
 */
@Injectable()
export class TrialBackingsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Every recommendation a trial will answer, frozen at the moment of asking.
   *
   * A player rarely arrives on one scout's word: one may have filed a GLOBAL
   * recommendation months ago and another a SPECIFIC one to this academy last
   * week. Both said *look at this player*, and the trial answers both — so both
   * gain when the player signs, and both are turned down together when a coach
   * says no.
   *
   * Taken now rather than at the end: a scout who files after the trial was
   * arranged did not help arrange it, and counting them would make the success
   * rate reward timing over judgement.
   *
   * It lives here because it is the seam between recommendations and trials, and
   * both sides create applications — the inbox by inviting, the trial by
   * nominating or being applied to.
   */
  async snapshotBackings(applicationId: string, playerId: string, academyId: string) {
    const backing = await this.prisma.recommendation.findMany({
      where: {
        playerId,
        rejectedAt: null,
        // A cleared recommendation was already settled by a trial the player
        // passed (Rule 13). It is not riding on this one.
        clearedAt: null,
        // Addressed to this academy, or offered to everyone — a GLOBAL
        // recommendation is a scout saying "somebody should look at this
        // player", and this academy is the somebody that did.
        OR: [{ targets: { some: { academyId } } }, { type: 'GLOBAL' }],
      },
      select: { id: true },
    });
    if (backing.length === 0) return;

    await this.prisma.trialApplicationBacking.createMany({
      data: backing.map((recommendation) => ({
        applicationId,
        recommendationId: recommendation.id,
      })),
      skipDuplicates: true,
    });
  }

  /** The recommendations riding on this application, the prompting one included. */
  async backingsOf(applicationId: string, promptId: string | null) {
    const rows = await this.prisma.trialApplicationBacking.findMany({
      where: { applicationId },
      select: { recommendationId: true },
    });
    const ids = new Set(rows.map((row) => row.recommendationId));
    if (promptId) ids.add(promptId);
    return [...ids];
  }
}
