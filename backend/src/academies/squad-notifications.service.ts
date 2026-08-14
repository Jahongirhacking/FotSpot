import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * "Somebody joined your squad", "somebody left it".
 *
 * ## One place, because a squad changes in five
 *
 * A player arrives by accepting an invitation, by being imported on a transfer,
 * or by being placed after a trial; they leave by being removed, by accepting
 * another academy, or by walking out of a local team. Writing the notification
 * at each of those sites would mean six chances to address it to the wrong
 * person, or to forget it in the seventh. The callers say *what happened*; this
 * decides who hears about it and what the message carries.
 *
 * ## The manager is the recipient
 *
 * Squad membership is the manager's to run — they invite, they remove, they
 * arrange the groups (§1.10) — so they are who a change concerns. Coaches are
 * not notified: a coach works with the group they are given, and a roster change
 * they cannot act on is a message that teaches them to stop reading these.
 *
 * Both kinds of organisation, deliberately. A local team's manager runs a squad
 * exactly as an academy's does; that half of the product is shared, and so is
 * this.
 *
 * ## Localisation, and the name
 *
 * The payload carries `playerName`; the words around it are chosen by the client
 * from the event, which is how every other notification in this system is
 * translated (see `NotificationList`). Putting a rendered Uzbek sentence in the
 * payload would freeze the message in one language at write time — including for
 * a manager who reads the app in Russian.
 *
 * ## Failure is not the caller's problem
 *
 * Every method here is called *after* the membership transaction has committed
 * (§17), so the change is already true. A notification that cannot be written
 * must not turn a completed transfer into an error the player sees, so failures
 * are logged and swallowed — the one place in this codebase where that is right,
 * because the alternative is worse for the person who did nothing wrong.
 */
@Injectable()
export class SquadNotificationsService {
  private readonly logger = new Logger(SquadNotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** A player is now in this squad. */
  async announceJoined(academyId: string, playerUserId: string, actorUserId?: string | null) {
    await this.announce('SQUAD_JOINED', academyId, playerUserId, actorUserId);
  }

  /** A player is no longer in this squad, however that came about. */
  async announceLeft(academyId: string, playerUserId: string, actorUserId?: string | null) {
    await this.announce('SQUAD_LEFT', academyId, playerUserId, actorUserId);
  }

  private async announce(
    event: 'SQUAD_JOINED' | 'SQUAD_LEFT',
    academyId: string,
    playerUserId: string,
    actorUserId?: string | null,
  ) {
    try {
      const [academy, player] = await Promise.all([
        this.prisma.academyProfile.findUnique({
          where: { id: academyId },
          select: {
            name: true,
            kind: true,
            // Managers, plural, though an academy has one: reading the set means
            // a record mid-handover notifies both rather than neither.
            members: { where: { role: 'MANAGER' }, select: { userId: true } },
          },
        }),
        this.prisma.user.findUnique({
          where: { id: playerUserId },
          select: { firstName: true, lastName: true, username: true },
        }),
      ]);
      if (!academy || !player) return;

      const playerName =
        [player.firstName, player.lastName].filter(Boolean).join(' ') || player.username || '';

      for (const manager of academy.members) {
        // A manager acting on their own squad already knows — telling them what
        // they just did is the notification everybody learns to swipe away.
        if (manager.userId === actorUserId) continue;

        await this.notifications.notify(
          manager.userId,
          event,
          {
            academyId,
            academyName: academy.name,
            academyKind: academy.kind,
            playerUserId,
            playerName,
          },
          { userId: playerUserId, role: 'player' },
        );
      }
    } catch (error) {
      this.logger.warn(
        `Could not announce ${event} for academy ${academyId}: ${(error as Error).message}`,
      );
    }
  }
}
