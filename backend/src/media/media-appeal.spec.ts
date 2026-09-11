import type { MediaCategory, RatingSource } from '@prisma/client';
import { MediaService } from './media.service';

/**
 * A player appealing the number on their clip.
 *
 * Only a moderator's relative rating can be appealed: a coach's is verified,
 * and there is nobody above a coach to appeal to. A filed appeal goes to the
 * super admins who answer them — in the app and in the operator chat.
 */

const ROW: {
  id: string;
  playerId: string;
  status: string;
  category: MediaCategory;
  rating: number | null;
  reportedBy: RatingSource;
  title: string | null;
} = {
  id: 'clip-1',
  playerId: 'player-1',
  status: 'ACTIVE',
  category: 'DRIBBLING',
  rating: 72,
  reportedBy: 'RELATIVE',
  title: 'Weak-foot cut inside',
};

function build(row: Partial<typeof ROW> = {}, pending = false) {
  const current = { ...ROW, ...row };
  const prisma = {
    media: { findUnique: jest.fn(async (): Promise<unknown> => current) },
    ratingAppeal: {
      findFirst: jest.fn(async () => (pending ? { id: 'appeal-0' } : null)),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'appeal-1',
        status: 'PENDING',
        ...data,
      })),
    },
    user: { findMany: jest.fn(async () => [{ id: 'super-1' }, { id: 'super-2' }]) },
  };
  const notifications = { notify: jest.fn(async () => undefined) };
  const adminAlerts = { announce: jest.fn(async () => undefined) };

  const wiring = Object.create(MediaService.prototype) as Record<string, unknown>;
  wiring.prisma = prisma;
  wiring.notifications = notifications;
  wiring.adminAlerts = adminAlerts;
  wiring.ownPlayerProfile = async () => ({ id: 'player-1', firstName: 'Aziz', lastName: 'K' });
  const service = wiring as unknown as MediaService;

  return { service, prisma, notifications, adminAlerts };
}

const REASON = { reason: 'The stop at 0:12 is clean; 72 undersells it.' };

describe('MediaService.appealRating', () => {
  it('files an appeal against a relative rating, remembering the number disputed', async () => {
    const { service, prisma } = build();

    const appeal = await service.appealRating('user-1', 'clip-1', REASON);

    expect(prisma.ratingAppeal.create).toHaveBeenCalledWith({
      data: { mediaId: 'clip-1', playerId: 'player-1', reason: REASON.reason, ratingAtAppeal: 72 },
    });
    expect(appeal).toMatchObject({ id: 'appeal-1', status: 'PENDING' });
  });

  it('refuses a verified rating — a coach’s number is not appealed', async () => {
    const { service, prisma } = build({ reportedBy: 'VERIFIED' });

    await expect(service.appealRating('user-1', 'clip-1', REASON)).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.ratingAppeal.create).not.toHaveBeenCalled();
  });

  it('refuses an unrated clip and a highlights clip', async () => {
    await expect(
      build({ rating: null }).service.appealRating('user-1', 'clip-1', REASON),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      build({ category: 'MATCH_HIGHLIGHTS', rating: null }).service.appealRating(
        'user-1',
        'clip-1',
        REASON,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('is a 409 while an appeal on the clip is still open', async () => {
    const { service } = build({}, true);
    await expect(service.appealRating('user-1', 'clip-1', REASON)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('refuses another player’s clip', async () => {
    const { service } = build({ playerId: 'player-2' });
    await expect(service.appealRating('user-1', 'clip-1', REASON)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('tells every active super admin in the app, and the operator chat', async () => {
    const { service, prisma, notifications, adminAlerts } = build();

    await service.appealRating('user-1', 'clip-1', REASON);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, roles: { some: { role: { name: 'super_admin' } } } },
      }),
    );
    expect(notifications.notify).toHaveBeenCalledTimes(2);
    expect(notifications.notify).toHaveBeenCalledWith(
      'super-1',
      'RATING_APPEAL_FILED',
      expect.objectContaining({
        appealId: 'appeal-1',
        mediaId: 'clip-1',
        category: 'DRIBBLING',
        rating: 72,
        playerName: 'Aziz K',
        reason: REASON.reason,
      }),
      { userId: 'user-1', role: 'player' },
    );
    expect(adminAlerts.announce).toHaveBeenCalledWith({
      kind: 'RATING_APPEALED',
      name: 'Aziz K',
      category: 'DRIBBLING',
      rating: 72,
      reason: REASON.reason,
    });
  });

  it('tells nobody when the appeal is refused', async () => {
    const { service, notifications, adminAlerts } = build({ reportedBy: 'VERIFIED' });
    await service.appealRating('user-1', 'clip-1', REASON).catch(() => undefined);
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(adminAlerts.announce).not.toHaveBeenCalled();
  });
});
