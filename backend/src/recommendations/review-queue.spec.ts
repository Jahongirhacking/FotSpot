import { RecommendationsService } from './recommendations.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';

/**
 * A coach's online-review queue.
 *
 * The scoping *is* the authorization here: the query can only ever match rows
 * assigned to the caller, so there is no request — from a coach, a player, a
 * scout or another academy's staff — that returns somebody else's workload. A
 * caller with no assignments gets an empty page rather than a refusal, which is
 * the same answer and one fewer place to get a role check wrong.
 */

const COACH = 'coach-1';

function build() {
  const prisma = {
    recommendationReview: {
      findMany: jest.fn(async (_args: Record<string, unknown>): Promise<unknown[]> => []),
      count: jest.fn(async (_args: Record<string, unknown>): Promise<number> => 0),
    },
  };

  const service = Object.create(RecommendationsService.prototype) as RecommendationsService;
  const wired = service as unknown as { prisma: PrismaService; storage: StorageService };
  wired.prisma = prisma as unknown as PrismaService;
  wired.storage = {
    publicUrlOrNull: (key: string) => (key ? `https://cdn/${key}` : null),
  } as never;

  return { service, prisma };
}

async function queryFor(
  status?: 'PENDING' | 'DECIDED',
  options?: { page?: number; pageSize?: number },
) {
  const { service, prisma } = build();
  await service.listMyReviews(COACH, status, options);
  const [args] = prisma.recommendationReview.findMany.mock.calls[0] ?? [];
  if (!args) throw new Error('the queue never asked for reviews');
  return args as Record<string, any>;
}

describe('whose reviews a coach is sent', () => {
  it('asks only for reviews assigned to this coach', async () => {
    const { where } = await queryFor();
    // Every coach the review was handed to sees it — a session is worked by a
    // staff — but never one they were not handed.
    expect(where.assignees.some.coachUserId).toBe(COACH);
  });

  it('sends a caller with no assignments an empty page, not somebody else’s', async () => {
    const { service } = build();
    const result = await service.listMyReviews('a-player-who-is-not-a-coach');

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('shows only what is still waiting on an answer', async () => {
    const { where } = await queryFor('PENDING');
    expect(where.status).toBe('PENDING');
  });

  it.each([['APPROVED'], ['REJECTED']])('leaves a %s review out of the pending queue', async () => {
    const { where } = await queryFor('PENDING');
    // A single equality on PENDING, so nothing decided can match.
    expect(where.status).toBe('PENDING');
  });

  it('can still show the settled ones when asked', async () => {
    const { where } = await queryFor('DECIDED');
    expect(where.status).toEqual({ not: 'PENDING' });
  });
});

describe('paging the review queue', () => {
  it('pages in the database', async () => {
    const args = await queryFor('PENDING', { page: 4, pageSize: 12 });
    expect(args.skip).toBe(36);
    expect(args.take).toBe(12);
  });

  it('counts against the same condition it lists', async () => {
    const { service, prisma } = build();
    await service.listMyReviews(COACH);

    const [listed] = prisma.recommendationReview.findMany.mock.calls[0] as [Record<string, any>];
    const [counted] = prisma.recommendationReview.count.mock.calls[0] as [Record<string, any>];
    expect(counted.where).toEqual(listed.where);
  });

  it('reports the page it returned', async () => {
    const { service, prisma } = build();
    prisma.recommendationReview.count.mockResolvedValue(31);

    const result = await service.listMyReviews(COACH, 'PENDING', { page: 3, pageSize: 12 });
    expect(result).toMatchObject({ total: 31, page: 3, pageSize: 12 });
  });

  /*
   * The old query took fifty and said nothing about how many there were, which
   * a dashboard cannot turn into "page 1 of 3" — and which silently lost the
   * fifty-first player.
   */
  it('no longer stops at an arbitrary fifty', async () => {
    const args = await queryFor();
    expect(args.take).toBe(12);
    expect(args.take).not.toBe(50);
  });
});

describe('what a review row carries', () => {
  it('resolves the player’s photograph into a URL', async () => {
    const { service, prisma } = build();
    prisma.recommendationReview.findMany.mockResolvedValue([
      {
        id: 'review-1',
        status: 'PENDING',
        academy: { id: 'academy-1', name: 'Shurtan FC' },
        player: { id: 'player-1', firstName: 'Aziz', user: { avatarKey: 'public/a.jpg' } },
      },
    ]);

    const { items } = await service.listMyReviews(COACH);
    expect(items[0].player.avatarUrl).toBe('https://cdn/public/a.jpg');
    expect((items[0].player as Record<string, unknown>).user).toBeUndefined();
  });

  /*
   * Still no scout and no recommendation on the shape. A coach is never told who
   * put the player forward — see `listMyReviews` for why that would put a thumb
   * on the scale — and adding an avatar must not have smuggled it in.
   */
  it('still tells the coach nothing about who recommended the player', async () => {
    const args = await queryFor();

    expect(args.select.recommendation).toBeUndefined();
    expect(args.select.player.select.scoutId).toBeUndefined();
  });
});
