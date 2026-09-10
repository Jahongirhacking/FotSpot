import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BlogService } from './blog.service';
import { BlogController } from './blog.controller';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

/**
 * The rules a blog has to keep: a draft is nobody's to read but an admin's,
 * a like is one per person, a slug survives a title edit, and the first
 * publish date is the one the markup keeps.
 */

const AUTHOR = {
  id: 'admin-1',
  firstName: 'Ali',
  lastName: 'Valiyev',
  username: 'ali',
  avatarKey: null,
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
  author: AUTHOR,
  authorName: null,
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
  };
  const storage = {
    publicUrlOrNull: (key: string | null) => (key ? `https://cdn.example/${key}` : null),
    createUploadUrl: jest.fn(async (storageKey: string) => ({
      uploadUrl: 'https://put',
      storageKey,
      expiresIn: 300,
    })),
    deleteObject: jest.fn(async () => undefined),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new BlogService(prisma as never, storage as never, audit as never);
  return { service, prisma, tx, storage, audit };
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
    expect(post.author).toEqual({ name: 'Ali Valiyev', avatarUrl: null });
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
    'createCategory',
    'updateCategory',
    'removeCategory',
  ] as const)('%s is for admins only', (handler) => {
    expect(on(handler, ROLES_KEY)).toEqual(['admin', 'super_admin']);
    expect(on(handler, IS_PUBLIC_KEY)).toBeUndefined();
  });
});
