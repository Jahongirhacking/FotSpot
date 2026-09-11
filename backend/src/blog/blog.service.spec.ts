import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BlogService } from './blog.service';
import { BlogController } from './blog.controller';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

/**
 * The rules a blog has to keep: a draft is nobody's to read but an admin's,
 * a like is one per person, a slug survives a title edit, and the first
 * publish date is the one the markup keeps.
 */

/** The academy a post can be signed by; null on the row means the mascot signs it. */
const ACADEMY_AUTHOR = {
  id: 'acad-1',
  name: 'Bunyodkor',
  logoKey: 'public/academies/acad-1/logo.png',
};
const CATEGORY = { id: 'cat-1', slug: 'news', name: 'News' };

const ROW = {
  id: 'post-1',
  slug: 'yangi-akademiya-toshkentda-ochildi',
  title: 'Yangi akademiya Toshkentda ochildi',
  excerpt: 'A new academy opened in Tashkent.',
  content: '# Heading\n\nSome **text**.',
  contentHtml: '<h2>Heading</h2>\n<p>Some <strong>text</strong>.</p>',
  coverKey: 'public/blog/post-1/cover.jpg',
  coverAlt: 'The pitch',
  categoryId: 'cat-1',
  category: CATEGORY,
  authorUserId: 'admin-1',
  authorAcademyId: null,
  authorAcademy: null,
  status: 'PUBLISHED',
  publishedAt: new Date('2026-09-01T10:00:00.000Z'),
  readingMinutes: 1,
  featured: false,
  seoTitle: null,
  metaDescription: null,
  seoKeywords: [],
  canonicalUrl: null,
  ogTitle: null,
  ogDescription: null,
  ogImageKey: null,
  likeCount: 3,
  images: [] as { storageKey: string }[],
  createdAt: new Date('2026-08-30T10:00:00.000Z'),
  updatedAt: new Date('2026-09-02T10:00:00.000Z'),
};

function build(row: Record<string, unknown> | null = ROW) {
  const tx = {
    blogPostLike: {
      createMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    blogPost: {
      update: jest.fn(async () => ({})),
      findUniqueOrThrow: jest.fn(async () => ({ likeCount: 4 })),
    },
  };
  const prisma = {
    blogPost: {
      // Honours `select` like Prisma would, so a test sees what a reader sees.
      findFirst: jest.fn(async (args?: { select?: Record<string, unknown> }): Promise<unknown> => {
        if (!row || !args?.select) return row;
        return Object.fromEntries(Object.keys(args.select).map((key) => [key, row[key]]));
      }),
      findMany: jest.fn(async (): Promise<unknown[]> => []),
      findUnique: jest.fn(
        async (_args: { where: { id?: string; slug?: string } }): Promise<unknown> => row,
      ),
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...ROW,
        ...data,
        status: 'DRAFT',
        publishedAt: null,
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...ROW, ...data })),
      updateMany: jest.fn(async () => ({ count: 0 })),
      delete: jest.fn(async () => ROW),
    },
    blogPostLike: { findUnique: jest.fn(async (): Promise<unknown> => null) },
    blogCategory: {
      findMany: jest.fn(async (): Promise<unknown[]> => []),
      findUnique: jest.fn(async (): Promise<unknown> => null),
    },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: typeof tx) => unknown)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
    // The random picks: first call players, second call academies.
    $queryRaw: jest.fn(async (..._args: unknown[]): Promise<{ id: string }[]> => []),
    playerProfile: { findMany: jest.fn(async (_args?: unknown): Promise<unknown[]> => []) },
    academyProfile: {
      findMany: jest.fn(async (): Promise<unknown[]> => []),
      findUnique: jest.fn(async (_args?: unknown): Promise<unknown> => null),
    },
    blogPostImage: {
      findMany: jest.fn(async (): Promise<unknown[]> => []),
      findUnique: jest.fn(async (): Promise<unknown> => null),
      findFirst: jest.fn(async (): Promise<unknown> => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'img-1',
        createdAt: new Date('2026-09-03T10:00:00.000Z'),
        ...data,
      })),
      delete: jest.fn(async () => ({})),
    },
  };
  const storage = {
    publicUrlOrNull: (key: string | null) => (key ? `https://cdn.example/${key}` : null),
    createUploadUrl: jest.fn(async (storageKey: string) => ({
      uploadUrl: 'https://put',
      storageKey,
      expiresIn: 300,
    })),
    deleteObject: jest.fn(async () => undefined),
    describeObject: jest.fn(async (): Promise<{ size: number; contentType?: string } | null> => ({
      size: 1234,
      contentType: 'image/png',
    })),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const players = {
    starsFor: jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id, 3]))),
  };
  const service = new BlogService(
    prisma as never,
    storage as never,
    audit as never,
    players as never,
  );
  return { service, prisma, tx, storage, audit, players };
}

describe('reading — only what is published', () => {
  it('asks for published posts only, on the page, the listing and the sitemap', async () => {
    const { service, prisma } = build();

    await service.bySlug(ROW.slug);
    await service.list({});
    await service.sitemapEntries();
    await service.home();

    // Every read names PUBLISHED and a publish date — `not null`, or a window
    // within it for "this week".
    const reads = [
      ...(prisma.blogPost.findFirst.mock.calls as unknown as [
        { where: Record<string, unknown> },
      ][]),
      ...(prisma.blogPost.findMany.mock.calls as unknown as [{ where: Record<string, unknown> }][]),
    ];
    expect(reads.length).toBeGreaterThan(3);
    for (const [args] of reads) {
      expect(args.where.status).toBe('PUBLISHED');
      expect(args.where.publishedAt).toBeDefined();
    }
  });

  it('serves a reader the rendered HTML and public URLs, never keys or Markdown', async () => {
    const { service } = build();

    const post = await service.bySlug(ROW.slug);

    expect(post.contentHtml).toBe(ROW.contentHtml);
    expect(post.coverUrl).toBe('https://cdn.example/public/blog/post-1/cover.jpg');
    expect(post).not.toHaveProperty('content');
    expect(post).not.toHaveProperty('coverKey');
    // No academy chosen: the mascot signs, and nothing about the admin leaks.
    expect(post.author).toEqual({ kind: 'mascot' });
    expect(JSON.stringify(post)).not.toMatch(/admin-1|firstName|username/);
  });

  it('a post signed by an academy carries its name, logo and id', async () => {
    const { service } = build({ ...ROW, authorAcademyId: 'acad-1', authorAcademy: ACADEMY_AUTHOR });
    const post = await service.bySlug(ROW.slug);
    expect(post.author).toEqual({
      kind: 'academy',
      id: 'acad-1',
      name: 'Bunyodkor',
      avatarUrl: 'https://cdn.example/public/academies/acad-1/logo.png',
    });
  });

  it('404s a draft for a reader, whoever they are', async () => {
    const { service } = build(null);

    await expect(service.bySlug('some-draft')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.bySlug('some-draft', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('says whether this reader liked it, and nothing for a guest', async () => {
    const { service, prisma } = build();
    prisma.blogPostLike.findUnique.mockResolvedValue({ postId: 'post-1' });

    expect((await service.bySlug(ROW.slug, 'user-1')).liked).toBe(true);
    expect((await service.bySlug(ROW.slug)).liked).toBe(false);
  });
});

describe('likes — one per person per post', () => {
  it('adds the like and moves the count together', async () => {
    const { service, tx } = build();

    await expect(service.setLike(ROW.slug, 'user-1', true)).resolves.toEqual({
      liked: true,
      likeCount: 4,
    });
    expect(tx.blogPostLike.createMany).toHaveBeenCalledWith({
      data: [{ postId: 'post-1', userId: 'user-1' }],
      skipDuplicates: true,
    });
    expect(tx.blogPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { likeCount: { increment: 1 } } }),
    );
  });

  it('a second like changes nothing', async () => {
    const { service, tx } = build();
    tx.blogPostLike.createMany.mockResolvedValue({ count: 0 });

    await service.setLike(ROW.slug, 'user-1', true);

    expect(tx.blogPost.update).not.toHaveBeenCalled();
  });

  it('taking it back only counts down when there was a like', async () => {
    const { service, tx } = build();
    tx.blogPostLike.deleteMany.mockResolvedValue({ count: 0 });

    await service.setLike(ROW.slug, 'user-1', false);

    expect(tx.blogPost.update).not.toHaveBeenCalled();
  });

  it('cannot like a draft', async () => {
    const { service } = build(null);

    await expect(service.setLike('draft', 'user-1', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('writing — slugs and dates', () => {
  it('makes the slug from the title, and renders the content, on create', async () => {
    const { service, prisma } = build();
    prisma.blogPost.findUnique.mockResolvedValue(null);

    const post = await service.create('admin-1', {
      title: 'Новая академия открылась в Ташкенте!',
      excerpt: 'x',
      content: '# Hi\n\nText',
    });

    expect(post.slug).toBe('novaya-akademiya-otkrylas-v-tashkente');
    expect(post.contentHtml).toBe('<h2>Hi</h2>\n<p>Text</p>');
    expect(post.status).toBe('DRAFT');
    expect(post.readingMinutes).toBe(1);
  });

  it('counts up when the title is already taken', async () => {
    const { service, prisma } = build();
    prisma.blogPost.findUnique.mockImplementation(
      async ({ where }: { where: { slug?: string } }) =>
        where.slug === 'hello' ? { id: 'other' } : null,
    );

    const post = await service.create('admin-1', { title: 'Hello', excerpt: 'x', content: 'y' });

    expect(post.slug).toBe('hello-2');
  });

  it('a title edit never rewrites the slug', async () => {
    const { service, prisma } = build();

    await service.update('admin-1', 'post-1', { title: 'A completely different title' });

    const [args] = prisma.blogPost.update.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ];
    expect(args.data).not.toHaveProperty('slug');
    expect(args.data.title).toBe('A completely different title');
  });

  it('an admin may set the slug, if it is free', async () => {
    const { service, prisma } = build();
    prisma.blogPost.findUnique.mockImplementation(
      async ({ where }: { where: { id?: string; slug?: string } }) =>
        where.id ? ROW : where.slug === 'taken' ? { id: 'other' } : null,
    );

    await service.update('admin-1', 'post-1', { slug: 'new-address' });
    const [args] = prisma.blogPost.update.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ];
    expect(args.data.slug).toBe('new-address');

    await expect(service.update('admin-1', 'post-1', { slug: 'taken' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('publishing sets the date once and keeps it across a republish', async () => {
    const { service, prisma } = build();
    prisma.blogPost.findUnique.mockResolvedValue({ ...ROW, publishedAt: null });

    await service.publish('admin-1', 'post-1');
    let [args] = prisma.blogPost.update.mock.calls[0] as unknown as [
      { data: { publishedAt: Date; status: string } },
    ];
    expect(args.data.status).toBe('PUBLISHED');
    expect(args.data.publishedAt).toBeInstanceOf(Date);

    prisma.blogPost.findUnique.mockResolvedValue(ROW);
    await service.publish('admin-1', 'post-1');
    [args] = prisma.blogPost.update.mock.calls[1] as unknown as [
      { data: { publishedAt: Date; status: string } },
    ];
    expect(args.data.publishedAt).toEqual(ROW.publishedAt);
  });

  it('will not publish an empty post', async () => {
    const { service, prisma } = build();
    prisma.blogPost.findUnique.mockResolvedValue({ ...ROW, content: '   ' });

    await expect(service.publish('admin-1', 'post-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a cover key outside the blog directory', async () => {
    const { service } = build();

    await expect(
      service.update('admin-1', 'post-1', { coverKey: 'private/players/x/clip.mp4' }),
    ).rejects.toThrow();
  });

  it('refuses a canonical URL that is not an address', async () => {
    const { service } = build();

    await expect(
      service.update('admin-1', 'post-1', { canonicalUrl: 'not a url' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mints the cover key under the post’s own directory', async () => {
    const { service } = build();

    const signed = await service.imageUploadUrl('post-1', { filename: 'Cover Photo.JPG' });

    expect(signed.storageKey).toMatch(/^public\/blog\/post-1\/[0-9a-f-]+\.jpg$/);
    expect(signed.publicUrl).toContain('public/blog/post-1/');
  });

  it('signs a post with a verified academy, and refuses anything else', async () => {
    const { service, prisma } = build();
    prisma.academyProfile.findUnique.mockImplementation(async (args?: unknown) => {
      const id = (args as { where: { id: string } }).where.id;
      if (id === 'acad-1') return { kind: 'ACADEMY', status: 'VERIFIED' };
      if (id === 'team-1') return { kind: 'LOCAL_TEAM', status: 'VERIFIED' };
      return null;
    });

    await service.update('admin-1', 'post-1', { authorAcademyId: 'acad-1' });
    expect(prisma.blogPost.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ authorAcademyId: 'acad-1' }) }),
    );

    await service.update('admin-1', 'post-1', { authorAcademyId: '' });
    expect(prisma.blogPost.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ authorAcademyId: null }) }),
    );

    await expect(
      service.update('admin-1', 'post-1', { authorAcademyId: 'team-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update('admin-1', 'post-1', { authorAcademyId: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an upload ticket for something that is not an image', async () => {
    const { service } = build();
    await expect(
      service.imageUploadUrl('post-1', { filename: 'clip.mp4', contentType: 'video/mp4' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('body images — upload, confirm, list, delete', () => {
  const KEY = 'public/blog/post-1/abc-123.png';

  it('confirms an uploaded image and answers with its public URL, never the key', async () => {
    const { service, prisma } = build();

    const image = await service.confirmImage('post-1', { storageKey: KEY });

    expect(prisma.blogPostImage.create).toHaveBeenCalledWith({
      data: {
        postId: 'post-1',
        storageKey: KEY,
        filename: 'abc-123.png',
        contentType: 'image/png',
        size: 1234,
      },
    });
    expect(image).toEqual({
      id: 'img-1',
      filename: 'abc-123.png',
      url: `https://cdn.example/${KEY}`,
      contentType: 'image/png',
      size: 1234,
      createdAt: new Date('2026-09-03T10:00:00.000Z'),
    });
    expect(JSON.stringify(image)).not.toContain('storageKey');
  });

  it('refuses a key outside the post’s own directory', async () => {
    const { service, storage } = build();
    await expect(
      service.confirmImage('post-1', { storageKey: 'public/blog/post-2/x.png' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.confirmImage('post-1', { storageKey: 'private/players/p/clip.mp4' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.describeObject).not.toHaveBeenCalled();
  });

  it('refuses a confirmation for an object that never arrived', async () => {
    const { service, storage, prisma } = build();
    storage.describeObject.mockResolvedValue(null);
    await expect(service.confirmImage('post-1', { storageKey: KEY })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.blogPostImage.create).not.toHaveBeenCalled();
  });

  it('removes and refuses an object that is not an image', async () => {
    const { service, storage, prisma } = build();
    storage.describeObject.mockResolvedValue({ size: 9, contentType: 'application/zip' });
    await expect(service.confirmImage('post-1', { storageKey: KEY })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.deleteObject).toHaveBeenCalledWith(KEY);
    expect(prisma.blogPostImage.create).not.toHaveBeenCalled();
  });

  it('confirming the same key twice returns the same row', async () => {
    const { service, prisma } = build();
    prisma.blogPostImage.findUnique.mockResolvedValue({
      id: 'img-9',
      filename: 'abc-123.png',
      storageKey: KEY,
      contentType: 'image/png',
      size: 1,
      createdAt: new Date(),
    });
    const image = await service.confirmImage('post-1', { storageKey: KEY });
    expect(image.id).toBe('img-9');
    expect(prisma.blogPostImage.create).not.toHaveBeenCalled();
  });

  it('lists a post’s images newest first with URLs', async () => {
    const { service, prisma } = build();
    prisma.blogPostImage.findMany.mockResolvedValue([
      {
        id: 'img-2',
        filename: 'b.png',
        storageKey: 'public/blog/post-1/b.png',
        contentType: 'image/png',
        size: 2,
        createdAt: new Date(),
      },
    ]);
    const list = await service.listImages('post-1');
    expect(prisma.blogPostImage.findMany).toHaveBeenCalledWith({
      where: { postId: 'post-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(list).toHaveLength(1);
    expect(list[0].url).toBe('https://cdn.example/public/blog/post-1/b.png');
  });

  it('deletes the object and the row, and only for the post it belongs to', async () => {
    const { service, prisma, storage } = build();
    prisma.blogPostImage.findFirst.mockResolvedValue({ id: 'img-1', storageKey: KEY });

    await expect(service.deleteImage('post-1', 'img-1')).resolves.toEqual({ deleted: true });

    expect(prisma.blogPostImage.findFirst).toHaveBeenCalledWith({
      where: { id: 'img-1', postId: 'post-1' },
    });
    expect(storage.deleteObject).toHaveBeenCalledWith(KEY);
    expect(prisma.blogPostImage.delete).toHaveBeenCalledWith({ where: { id: 'img-1' } });
  });

  it('a missing image is a 404', async () => {
    const { service } = build();
    await expect(service.deleteImage('post-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deleting the post removes its body images from storage too', async () => {
    const { service, prisma, storage } = build();
    prisma.blogPost.findUnique.mockResolvedValue({
      ...ROW,
      images: [{ storageKey: KEY }, { storageKey: 'public/blog/post-1/second.jpg' }],
    });

    await service.remove('admin-1', 'post-1');

    expect(storage.deleteObject).toHaveBeenCalledWith(ROW.coverKey);
    expect(storage.deleteObject).toHaveBeenCalledWith(KEY);
    expect(storage.deleteObject).toHaveBeenCalledWith('public/blog/post-1/second.jpg');
  });
});

describe('routes — who may press what', () => {
  const on = (handler: keyof BlogController, key: string) =>
    Reflect.getMetadata(key, BlogController.prototype[handler]);

  it.each(['home', 'list', 'categories', 'sitemap', 'bySlug'] as const)(
    '%s is public',
    (handler) => {
      expect(on(handler, IS_PUBLIC_KEY)).toBe(true);
    },
  );

  it.each(['like', 'unlike'] as const)('%s needs an account, any role', (handler) => {
    expect(on(handler, IS_PUBLIC_KEY)).toBeUndefined();
    expect(on(handler, ROLES_KEY)).toBeUndefined();
  });

  it.each([
    'adminList',
    'adminGet',
    'create',
    'update',
    'publish',
    'unpublish',
    'remove',
    'imageUploadUrl',
    'listImages',
    'confirmImage',
    'deleteImage',
    'createCategory',
    'updateCategory',
    'removeCategory',
  ] as const)('%s is for admins only', (handler) => {
    expect(on(handler, ROLES_KEY)).toEqual(['admin', 'super_admin']);
    expect(on(handler, IS_PUBLIC_KEY)).toBeUndefined();
  });
});

describe('spotlight — the sidebar picks', () => {
  const year = new Date().getFullYear();

  it('returns the random order, the age band instead of the birth date, and no contacts', async () => {
    const { service, prisma } = build();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'p-2' }, { id: 'p-1' }])
      .mockResolvedValueOnce([{ id: 'a-1' }]);
    prisma.playerProfile.findMany.mockResolvedValue([
      {
        id: 'p-1',
        firstName: 'Ali',
        lastName: 'Karimov',
        birthDate: new Date(`${year - 15}-01-01`),
        primaryPosition: 'CM',
        region: 'Toshkent',
        user: { username: 'ali', avatarKey: 'public/avatars/ali.jpg' },
      },
      {
        id: 'p-2',
        firstName: 'Bobur',
        lastName: 'Tosh',
        birthDate: new Date(`${year - 25}-01-01`),
        primaryPosition: null,
        region: null,
        user: { username: null, avatarKey: null },
      },
    ]);
    prisma.academyProfile.findMany.mockResolvedValue([
      {
        id: 'a-1',
        name: 'Bunyodkor',
        region: 'Toshkent',
        district: 'Yakkasaroy',
        logoKey: 'public/academies/a-1/logo.png',
        trials: [{ id: 't-1' }, { id: 't-2' }],
      },
    ]);

    const result = await service.spotlight();

    expect(result.players.map((p) => p.id)).toEqual(['p-2', 'p-1']);
    expect(result.players[1]).toEqual({
      id: 'p-1',
      username: 'ali',
      firstName: 'Ali',
      lastName: 'Karimov',
      avatarUrl: 'https://cdn.example/public/avatars/ali.jpg',
      primaryPosition: 'CM',
      region: 'Toshkent',
      ageBand: 'U16',
      stars: 3,
    });
    expect(result.players[0].ageBand).toBe('Senior');
    expect(JSON.stringify(result)).not.toMatch(/birthDate|phone|email|Key"/);
    expect(result.academies).toEqual([
      {
        id: 'a-1',
        name: 'Bunyodkor',
        region: 'Toshkent',
        district: 'Yakkasaroy',
        logoUrl: 'https://cdn.example/public/academies/a-1/logo.png',
        openTrials: 2,
      },
    ]);
  });

  it('draws evidenced public players, oversampled, and six verified academies', async () => {
    const { service, prisma } = build();

    await service.spotlight();

    const [players, academies] = prisma.$queryRaw.mock.calls.map((call) =>
      (call[0] as TemplateStringsArray).join('?'),
    );
    expect(players).toMatch(/"isPrivate" = false AND u."isActive" = true/);
    expect(players).toMatch(/"moderationStatus" = 'VERIFIED'/);
    expect(players).toMatch(/"CoachAssessment"/);
    expect(players).toMatch(/ORDER BY random\(\)/);
    expect(academies).toMatch(/"kind" = 'ACADEMY' AND a."status" = 'VERIFIED'/);
    expect(prisma.$queryRaw.mock.calls[0][1]).toBe(24);
    expect(prisma.$queryRaw.mock.calls[1][1]).toBe(6);
  });

  it('keeps only players with at least half a star, six at most, in the drawn order', async () => {
    const { service, prisma, players } = build();
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    prisma.$queryRaw.mockResolvedValueOnce(ids.map((id) => ({ id }))).mockResolvedValueOnce([]);
    players.starsFor.mockResolvedValue(
      new Map([
        ['a', 0],
        ['b', 0.5],
        ['c', 4],
        ['d', 0],
        ['e', 1],
        ['f', 2.5],
        ['g', 3],
        ['h', 5],
      ]),
    );
    prisma.playerProfile.findMany.mockImplementation(async (args?: unknown) =>
      (args as { where: { id: { in: string[] } } }).where.id.in.map((id) => ({
        id,
        firstName: id,
        lastName: '',
        birthDate: new Date(`${year - 15}-01-01`),
        primaryPosition: null,
        region: null,
        user: { username: null, avatarKey: null },
      })),
    );

    const result = await service.spotlight();

    expect(result.players.map((p) => p.id)).toEqual(['b', 'c', 'e', 'f', 'g', 'h']);
    expect(result.players.every((p) => p.stars >= 0.5)).toBe(true);
  });

  it('caps a larger request', async () => {
    const { service, prisma } = build();
    await service.spotlight(50);
    expect(prisma.$queryRaw.mock.calls[0][1]).toBe(48);
  });
});
