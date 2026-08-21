import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationEvent, Prisma } from '@prisma/client';
import { StorageService } from '../storage/storage.service';
import { TelegramNotificationsService } from '../telegram/telegram-notifications.service';

/**
 * Who caused a notification, and in what capacity.
 *
 * Passed by the caller rather than inferred, because only the caller knows which
 * hat was on. A user can hold several roles at once, and "a coach rejected you"
 * and "a scout rejected you" are different messages even when they are the same
 * person.
 *
 * Omitted entirely for events nobody triggered — a rule firing on its own.
 */
export interface NotificationActor {
  userId: string;
  /** `coach`, `academy_manager`, `scout`, `player`, `admin`. */
  role: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
    private storage: StorageService,
    private telegram: TelegramNotificationsService,
  ) {}

  async notify(
    userId: string,
    event: NotificationEvent,
    payload: Record<string, unknown>,
    actor?: NotificationActor,
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        event,
        payload: payload as Prisma.InputJsonValue,
        actorUserId: actor?.userId ?? null,
        actorRole: actor?.role ?? null,
      },
      include: { actor: { select: ACTOR_FIELDS } },
    });

    // The socket carries the same shape the list returns, so a notification
    // arriving live and one loaded on refresh render identically.
    this.gateway.emitToUser(userId, 'notification', this.withActor(notification));

    /*
     * Telegram, as an extra copy — and strictly after the notification exists.
     *
     * Ordering is the whole safety argument. The row is written and the socket
     * has fired before this line runs, so the notification is already delivered
     * by every means that matters; Telegram is an additional channel layered on
     * top, never a step the original depends on.
     *
     * `enqueue` is documented never to throw and swallows its own failures, so
     * an unconfigured bot, an unreachable Redis or a user who has not linked
     * anything all end here silently. The `await` is only so `notify` does not
     * return while a database read is still outstanding — the Telegram *request*
     * itself happens on the queue, not here, so this adds no third-party network
     * call to the caller's request.
     */
    await this.telegram.enqueue(userId, event, payload);

    return notification;
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: ACTOR_FIELDS } },
    });
    return rows.map((row) => this.withActor(row));
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  /**
   * Clear the whole list at once.
   *
   * Scoped to `userId` and to rows that are still unread: the count it returns
   * is then the number of things that actually changed, which is what the screen
   * says back to the person who pressed it.
   */
  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { count };
  }

  /** Names and an avatar URL, so a row can say who without a second request. */
  private withActor<T extends { actor: ActorRow | null }>(notification: T) {
    return {
      ...notification,
      actor: notification.actor ? this.storage.withAvatarUrl(notification.actor) : null,
    };
  }
}

const ACTOR_FIELDS = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  avatarKey: true,
} as const;

type ActorRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  avatarKey: string | null;
};
