import { PlayersService } from './players.service';

/**
 * Ranking search by the card's star row.
 *
 * The trap this guards is the obvious shortcut: fetching a page and sorting it.
 * That reorders twelve arbitrary players and calls it a ranking — page 2 comes
 * from a different ordering than page 1, so a player can appear on both or on
 * neither. The assertions below are mostly about *what is asked of the database*,
 * because that is where the difference between a ranking and a shuffle lives.
 *
 * The stars themselves are `computeCardStars` via `starsFor`, reused rather than
 * reimplemented — so nothing here re-tests the calculation, only the ordering
 * built on top of it.
 */

interface Row {
  id: string;
  createdAt: Date;
}

function build(evidenced: Row[], zeroIds: string[], stars: Record<string, number>) {
  const findMany = jest.fn(async (args: Record<string, unknown>) => {
    // The page fetch, by id.
    const where = args.where as Record<string, unknown>;
    if (where && (where.id as { in?: string[] })?.in) {
      return (where.id as { in: string[] }).in.map((id) => ({ id, user: null }));
    }
    // The zero group, paged by SQL.
    if ((args.orderBy as Record<string, unknown>)?.createdAt) {
      const skip = (args.skip as number) ?? 0;
      const take = (args.take as number) ?? zeroIds.length;
      return zeroIds.slice(skip, skip + take).map((id) => ({ id }));
    }
    // The evidenced candidates.
    return evidenced;
  });

  const prisma = {
    playerProfile: { findMany, count: jest.fn(async () => zeroIds.length) },
    media: { findMany: jest.fn(async () => []) },
    coachAssessment: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  const service = Object.create(PlayersService.prototype) as PlayersService;
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma,
    storage: { publicUrlOrNull: () => null },
    // `starsFor` is the existing shared path; stubbing it keeps this spec about
    // the ordering rather than re-testing computeCardStars.
    starsFor: jest.fn(async () => new Map(Object.entries(stars))),
  });

  return { service, prisma, findMany };
}

const at = (iso: string) => new Date(iso);

const EVIDENCED: Row[] = [
  { id: 'three', createdAt: at('2026-01-01') },
  { id: 'five', createdAt: at('2026-01-02') },
  { id: 'one', createdAt: at('2026-01-03') },
];
const STARS = { three: 3, five: 5, one: 1 };

function searchByStars(service: PlayersService, order: 'asc' | 'desc', page = 1, pageSize = 10) {
  return (
    service as unknown as {
      searchByStars: (
        where: unknown,
        order: 'asc' | 'desc',
        page: number,
        pageSize: number,
      ) => Promise<{ items: { id: string; stars: number }[]; total: number }>;
    }
  ).searchByStars({}, order, page, pageSize);
}

describe('searchByStars — the ranking', () => {
  it('puts the highest star row first when descending', async () => {
    const { service } = build(EVIDENCED, [], STARS);

    const result = await searchByStars(service, 'desc');

    expect(result.items.map((row) => row.id)).toEqual(['five', 'three', 'one']);
  });

  it('reverses cleanly when ascending', async () => {
    const { service } = build(EVIDENCED, [], STARS);

    const result = await searchByStars(service, 'asc');

    expect(result.items.map((row) => row.id)).toEqual(['one', 'three', 'five']);
  });

  it('returns the star value the ranking used, not a recomputed one', async () => {
    const { service } = build(EVIDENCED, [], STARS);

    const result = await searchByStars(service, 'desc');

    expect(result.items).toEqual([
      expect.objectContaining({ id: 'five', stars: 5 }),
      expect.objectContaining({ id: 'three', stars: 3 }),
      expect.objectContaining({ id: 'one', stars: 1 }),
    ]);
  });

  /*
   * A tie has to have a defined order or pagination breaks quietly: equal rows
   * with no tiebreak may come back differently on each query, which shows one
   * player twice and drops another.
   */
  it('breaks a tie by newest first, in both directions', async () => {
    const tied: Row[] = [
      { id: 'older', createdAt: at('2026-01-01') },
      { id: 'newer', createdAt: at('2026-02-01') },
    ];
    const { service } = build(tied, [], { older: 2, newer: 2 });

    const desc = await searchByStars(service, 'desc');
    const asc = await searchByStars(build(tied, [], { older: 2, newer: 2 }).service, 'asc');

    expect(desc.items.map((row) => row.id)).toEqual(['newer', 'older']);
    expect(asc.items.map((row) => row.id)).toEqual(['newer', 'older']);
  });
});

describe('searchByStars — players with no evidence', () => {
  /*
   * `computeCardStars` reads a rated public clip and a coach assessment and
   * nothing else, so a player with neither is exactly zero. They need a count and
   * a stable order, never a ranking — which is what keeps the in-memory half
   * bounded by "players who have uploaded something" rather than by everyone who
   * matched the filters.
   */
  it('leaves them at the end when descending', async () => {
    const { service } = build(EVIDENCED, ['blank-1', 'blank-2'], STARS);

    const result = await searchByStars(service, 'desc');

    expect(result.items.map((row) => row.id)).toEqual([
      'five',
      'three',
      'one',
      'blank-1',
      'blank-2',
    ]);
  });

  it('puts them first when ascending, because zero is the lowest', async () => {
    const { service } = build(EVIDENCED, ['blank-1', 'blank-2'], STARS);

    const result = await searchByStars(service, 'asc');

    expect(result.items.map((row) => row.id)).toEqual([
      'blank-1',
      'blank-2',
      'one',
      'three',
      'five',
    ]);
  });

  it('reports them as zero rather than omitting the field', async () => {
    const { service } = build([], ['blank-1'], {});

    const result = await searchByStars(service, 'desc');

    expect(result.items).toEqual([expect.objectContaining({ id: 'blank-1', stars: 0 })]);
  });

  /* A `notIn` list of ids grows past what a query can carry; a `none` relation
     filter is a NOT EXISTS and does not. */
  it('excludes them with a relation filter, never a list of ids', async () => {
    const { service, findMany } = build(EVIDENCED, ['blank-1'], STARS);

    await searchByStars(service, 'desc');

    const zeroQuery = findMany.mock.calls
      .map(([args]) => args as Record<string, unknown>)
      .find((args) => (args.orderBy as Record<string, unknown>)?.createdAt);
    expect(JSON.stringify(zeroQuery?.where)).toContain('none');
    expect(JSON.stringify(zeroQuery?.where)).not.toContain('notIn');
  });
});

describe('searchByStars — pagination', () => {
  it('counts both halves', async () => {
    const { service } = build(EVIDENCED, ['blank-1', 'blank-2'], STARS);

    const result = await searchByStars(service, 'desc');

    expect(result.total).toBe(5);
  });

  it('pages within the ranked half without touching the zero half', async () => {
    const { service } = build(EVIDENCED, ['blank-1', 'blank-2'], STARS);

    const result = await searchByStars(service, 'desc', 1, 2);

    expect(result.items.map((row) => row.id)).toEqual(['five', 'three']);
  });

  /* The page that straddles the boundary is the one a naive implementation drops
     rows on. */
  it('fills a page that spans both halves', async () => {
    const { service } = build(EVIDENCED, ['blank-1', 'blank-2'], STARS);

    const result = await searchByStars(service, 'desc', 2, 2);

    expect(result.items.map((row) => row.id)).toEqual(['one', 'blank-1']);
  });

  it('pages entirely inside the zero half once the ranked half is spent', async () => {
    const { service } = build(EVIDENCED, ['blank-1', 'blank-2'], STARS);

    const result = await searchByStars(service, 'desc', 3, 2);

    expect(result.items.map((row) => row.id)).toEqual(['blank-2']);
  });

  it('does not repeat a player across consecutive pages', async () => {
    const first = await searchByStars(build(EVIDENCED, ['b1', 'b2'], STARS).service, 'desc', 1, 2);
    const second = await searchByStars(build(EVIDENCED, ['b1', 'b2'], STARS).service, 'desc', 2, 2);

    const ids = [...first.items, ...second.items].map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
