import { AcademiesService } from './academies.service';

/**
 * The public directory's three filters. Region goes to the database and is
 * the cache key; district and name narrow that province's rows in memory.
 */
const ROWS = [
  {
    id: 'a',
    name: 'Bunyodkor Academy',
    region: 'Toshkent shahri',
    district: 'Chilonzor',
    logoKey: 'public/a.png',
  },
  {
    id: 'b',
    name: 'Paxtakor Youth',
    region: 'Toshkent shahri',
    district: 'Yunusobod',
    logoKey: null,
  },
  {
    id: 'c',
    name: 'Nasaf Kids',
    region: 'Qashqadaryo viloyati',
    district: 'Qarshi',
    logoKey: null,
  },
];

function build() {
  const prisma = {
    academyProfile: {
      findMany: jest.fn(async ({ where }: { where: { region?: string } }) =>
        ROWS.filter((row) => !where.region || row.region === where.region),
      ),
    },
  };
  const wiring = Object.create(AcademiesService.prototype) as Record<string, unknown>;
  wiring.prisma = prisma;
  wiring.redis = {
    wrap: jest.fn(async (_key: string, _ttl: number, load: () => Promise<unknown>) => load()),
  };
  wiring.storage = { publicUrlOrNull: (key: string | null) => (key ? `https://cdn/${key}` : null) };
  return { service: wiring as unknown as AcademiesService, prisma };
}

describe('AcademiesService.listPublic — the directory’s filters', () => {
  it('lists every verified academy with a logo URL, never the storage key', async () => {
    const { service } = build();
    const list = await service.listPublic();
    expect(list.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(list[0]).toMatchObject({ logoUrl: 'https://cdn/public/a.png' });
    expect(list[0]).not.toHaveProperty('logoKey');
  });

  it('asks the database for one province and narrows the district in memory', async () => {
    const { service, prisma } = build();
    const list = await service.listPublic({ region: 'Toshkent shahri', district: 'Yunusobod' });
    expect(prisma.academyProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ region: 'Toshkent shahri' }) }),
    );
    expect(list.map((a) => a.id)).toEqual(['b']);
  });

  it('searches the name, case-insensitively and ignoring surrounding spaces', async () => {
    const { service } = build();
    expect((await service.listPublic({ query: '  nasaf ' })).map((a) => a.id)).toEqual(['c']);
    expect((await service.listPublic({ query: 'academy' })).map((a) => a.id)).toEqual(['a']);
  });
});
