import { PlayersService } from './players.service';

/**
 * What the search asks the database for, per filter.
 *
 * Prisma is a fake that records the `where`; the assertion is on the question
 * sent to Postgres, because that — not what is done to the rows afterwards —
 * is where a filter either includes the two-footed players or does not.
 */

function build() {
  const findMany = jest.fn(async () => []);
  const count = jest.fn(async () => 0);
  const prisma = {
    playerProfile: { findMany, count },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const service = Object.create(PlayersService.prototype) as PlayersService;
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma,
    storage: { publicUrlOrNull: () => null },
    starsFor: jest.fn(async () => new Map()),
  });
  return { service, findMany, count };
}

const whereSent = (findMany: jest.Mock) =>
  (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;

describe('PlayersService.search — the dominant-foot filter as sent to the database', () => {
  it('LEFT asks for left-footed and two-footed players', async () => {
    const { service, findMany, count } = build();

    await service.search({ dominantFoot: 'LEFT' });

    expect(whereSent(findMany).dominantFoot).toEqual({ in: ['LEFT', 'BOTH'] });
    // The total agrees with the page: same question to both queries.
    expect(count).toHaveBeenCalledWith({ where: whereSent(findMany) });
  });

  it('RIGHT asks for right-footed and two-footed players', async () => {
    const { service, findMany } = build();

    await service.search({ dominantFoot: 'RIGHT' });

    expect(whereSent(findMany).dominantFoot).toEqual({ in: ['RIGHT', 'BOTH'] });
  });

  it('BOTH asks for two-footed players only', async () => {
    const { service, findMany } = build();

    await service.search({ dominantFoot: 'BOTH' });

    expect(whereSent(findMany).dominantFoot).toBe('BOTH');
  });

  it('no filter asks nothing about feet', async () => {
    const { service, findMany } = build();

    await service.search({});

    expect(whereSent(findMany)).not.toHaveProperty('dominantFoot');
  });
});
