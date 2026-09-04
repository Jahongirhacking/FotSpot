import { BadRequestException } from '@nestjs/common';
import type { MediaCategory, RatingSource } from '@prisma/client';
import { MediaService } from './media.service';

/**
 * A player re-filing their own clip under the right skill.
 *
 * The case that motivated it: a shooting clip uploaded as "technique". The
 * footage is fine, the label is wrong, and until now the only fix was delete
 * and re-upload. The one rule that moves with the category — an attribute
 * clip carries a rating, a highlights clip does not — is what these assert.
 */

const ROW: {
  id: string;
  playerId: string;
  status: string;
  moderationStatus: string;
  category: MediaCategory;
  rating: number | null;
  reportedBy: RatingSource;
  storageKey: string;
  posterKey: string | null;
  title: string | null;
  description: string | null;
} = {
  id: 'clip-1',
  playerId: 'player-1',
  status: 'ACTIVE',
  moderationStatus: 'VERIFIED',
  category: 'TECHNIQUE',
  rating: 70,
  reportedBy: 'COACH',
  storageKey: 'private/players/player-1/clip.mp4',
  posterKey: null,
  title: null,
  description: null,
};

function build(row: Partial<typeof ROW> = {}) {
  const current = { ...ROW, ...row };
  const prisma = {
    media: {
      findUnique: jest.fn(async (): Promise<unknown> => current),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...current,
        ...data,
      })),
    },
  };
  const redis = { del: jest.fn(async () => undefined) };
  const storage = { readUrlOrNull: jest.fn(async () => null) };

  // The service's own private wiring, without the DI container; only the
  // pieces `update` touches. `ownPlayerProfile` is stubbed: who owns the clip
  // is asserted elsewhere, and here the player always does.
  const wiring = Object.create(MediaService.prototype) as Record<string, unknown>;
  wiring.prisma = prisma;
  wiring.redis = redis;
  wiring.storage = storage;
  wiring.ownPlayerProfile = async () => ({ id: 'player-1' });
  const service = wiring as unknown as MediaService;

  return { service, prisma };
}

const written = (prisma: ReturnType<typeof build>['prisma']) =>
  (prisma.media.update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;

describe('MediaService.update — re-filing a clip under the right skill', () => {
  it('moves a clip from one attribute to another, keeping the rating as the player’s claim', async () => {
    const { service, prisma } = build();

    await service.update('user-1', 'clip-1', { category: 'FINISHING' });

    // The coach's 70 was about technique; under finishing it is the player's
    // own number again, kept rather than dropped so the bar does not go blank.
    expect(written(prisma)).toEqual({ category: 'FINISHING', rating: 70, reportedBy: 'SELF' });
  });

  it('takes a new rating along with the new category in one request', async () => {
    const { service, prisma } = build({ category: 'MATCH_HIGHLIGHTS', rating: null });

    await service.update('user-1', 'clip-1', { category: 'FINISHING', rating: 65 });

    expect(written(prisma)).toEqual({ category: 'FINISHING', rating: 65, reportedBy: 'SELF' });
  });

  it('refuses to file a highlights clip under an attribute with nothing to rate it', async () => {
    const { service, prisma } = build({ category: 'MATCH_HIGHLIGHTS', rating: null });

    await expect(service.update('user-1', 'clip-1', { category: 'PACE' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.media.update).not.toHaveBeenCalled();
  });

  it('drops the rating when a clip becomes highlights', async () => {
    const { service, prisma } = build();

    await service.update('user-1', 'clip-1', { category: 'MATCH_HIGHLIGHTS' });

    expect(written(prisma)).toEqual({
      category: 'MATCH_HIGHLIGHTS',
      rating: null,
      reportedBy: 'SELF',
    });
  });

  it('refuses a rating for a clip that is becoming highlights', async () => {
    const { service } = build();

    await expect(
      service.update('user-1', 'clip-1', { category: 'MATCH_HIGHLIGHTS', rating: 50 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /* The edit that has always worked still writes exactly what it wrote. */
  it('leaves category and rating alone when only the title changes', async () => {
    const { service, prisma } = build();

    await service.update('user-1', 'clip-1', { title: '  Volley  ' });

    expect(written(prisma)).toEqual({ title: 'Volley' });
  });

  it('treats the same category as no change', async () => {
    const { service, prisma } = build();

    await service.update('user-1', 'clip-1', { category: 'TECHNIQUE', title: 'x' });

    expect(written(prisma)).toEqual({ title: 'x' });
  });
});
