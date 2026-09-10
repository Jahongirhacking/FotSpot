import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type BlogPostStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.actions';
import {
  assertKeyUnder,
  blogMediaKey,
  blogMediaPrefix,
  PUBLIC_PREFIX,
} from '../storage/storage.keys';
import { pageOf, toSkipTake } from '../common/dto/pagination.dto';
import { ageAt, ageBandFor } from '../common/age.util';
import { slugify, uniqueSlug } from './blog-slug.util';
import { markdownToPlainText, readingMinutes, renderBlogMarkdown } from './blog-markdown.util';
import type {
  AdminListPostsDto,
  BlogImageUploadDto,
  ConfirmBlogImageDto,
  ListPostsDto,
  SaveCategoryDto,
  SavePostDto,
} from './dto/blog.dto';

/** What a card and a page know about the author. */
const AUTHOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  avatarKey: true,
} as const;

const CATEGORY_SELECT = { id: true, slug: true, name: true } as const;

/** The card: everything a listing draws, and nothing a page needs on top. */
const CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverKey: true,
  coverAlt: true,
  publishedAt: true,
  updatedAt: true,
  readingMinutes: true,
  likeCount: true,
  featured: true,
  category: { select: CATEGORY_SELECT },
  author: { select: AUTHOR_SELECT },
  authorName: true,
} as const;

const PUBLISHED: Prisma.BlogPostWhereInput = { status: 'PUBLISHED', publishedAt: { not: null } };

/** What the body-image endpoints accept: a browser-displayable picture. */
function isImageType(contentType: string): boolean {
  return /^image\/(jpeg|png|webp|gif|avif|svg\+xml)$/i.test(contentType.trim());
}

/** How many players and how many academies an article's sidebar shows. */
const SPOTLIGHT_SIZE = 6;
const SPOTLIGHT_MAX = 12;

/** How many the listing's sections show. */
const HOME_LATEST = 9;
const HOME_WEEK = 6;
const HOME_TOP = 5;
const RELATED = 3;

type CardRow = Prisma.BlogPostGetPayload<{ select: typeof CARD_SELECT }>;

/**
 * The blog — README §1.16's organic half.
 *
 * ## Two audiences, two shapes
 *
 * Readers, guests included, get published posts as cards and pages with the
 * rendered HTML, the pictures as public URLs, and nothing else. Admins get
 * the row as written — the Markdown, the keys, every SEO field — and are
 * the only ones who see a draft at all. The two never share a query: a
 * draft that leaked through a public listing is the one bug this module
 * exists to make impossible, so `PUBLISHED` is written into every public
 * read rather than into a flag a caller could forget.
 *
 * ## The content is rendered on write
 *
 * `contentHtml` is produced once, when the post is saved, from a Markdown
 * dialect this module owns (`blog-markdown.util.ts`). A read serves it as
 * is — no parsing per request, and no page ever trusts stored HTML, because
 * the stored HTML was made by the sanitiser.
 */
@Injectable()
export class BlogService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

  // ---------- Reading ----------

  /**
   * The listing page in one request: the featured post, what is new, what
   * the week liked, the all-time top, and the categories with a count each.
   */
  async home() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [featured, latest, thisWeek, top, categories] = await Promise.all([
      this.prisma.blogPost.findFirst({
        where: { ...PUBLISHED, featured: true },
        orderBy: { publishedAt: 'desc' },
        select: CARD_SELECT,
      }),
      this.prisma.blogPost.findMany({
        where: PUBLISHED,
        orderBy: { publishedAt: 'desc' },
        take: HOME_LATEST + 1,
        select: CARD_SELECT,
      }),
      this.prisma.blogPost.findMany({
        where: { ...PUBLISHED, publishedAt: { gte: weekAgo } },
        orderBy: [{ likeCount: 'desc' }, { publishedAt: 'desc' }],
        take: HOME_WEEK,
        select: CARD_SELECT,
      }),
      this.prisma.blogPost.findMany({
        where: { ...PUBLISHED, likeCount: { gt: 0 } },
        orderBy: [{ likeCount: 'desc' }, { publishedAt: 'desc' }],
        take: HOME_TOP,
        select: CARD_SELECT,
      }),
      this.categoriesWithCounts(),
    ]);

    // No featured post picked: the newest stands in, and is not repeated below.
    const lead = featured ?? latest[0] ?? null;
    const rest = latest.filter((post) => post.id !== lead?.id).slice(0, HOME_LATEST);

    return {
      featured: lead ? this.toCard(lead) : null,
      latest: rest.map((post) => this.toCard(post)),
      thisWeek: thisWeek.map((post) => this.toCard(post)),
      top: top.map((post) => this.toCard(post)),
      categories,
    };
  }

  /** One page of published posts, newest or most liked first. */
  async list(dto: ListPostsDto) {
    const { skip, take, page, pageSize } = toSkipTake(dto);
    const where: Prisma.BlogPostWhereInput = {
      ...PUBLISHED,
      ...(dto.category ? { category: { slug: dto.category } } : {}),
      ...(dto.q ? this.searchWhere(dto.q) : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        where,
        orderBy:
          dto.sort === 'top'
            ? [{ likeCount: 'desc' }, { publishedAt: 'desc' }]
            : { publishedAt: 'desc' },
        skip,
        take,
        select: CARD_SELECT,
      }),
      this.prisma.blogPost.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => this.toCard(row)),
      total,
      { page, pageSize },
    );
  }

  /** The categories in their order, each with how many published posts it holds. */
  async categoriesWithCounts() {
    const categories = await this.prisma.blogCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        ...CATEGORY_SELECT,
        description: true,
        _count: { select: { posts: { where: PUBLISHED } } },
      },
    });
    return categories.map(({ _count, ...category }) => ({ ...category, postCount: _count.posts }));
  }

  /**
   * One published post, as a reader gets it, with what to read next.
   *
   * `viewerUserId` only decides `liked`; a guest reads the same page. Related
   * posts are the newest in the same category, then the newest anywhere,
   * never the post itself.
   */
  async bySlug(slug: string, viewerUserId?: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { ...PUBLISHED, slug },
      select: {
        ...CARD_SELECT,
        contentHtml: true,
        seoTitle: true,
        metaDescription: true,
        seoKeywords: true,
        canonicalUrl: true,
        ogTitle: true,
        ogDescription: true,
        ogImageKey: true,
        categoryId: true,
      },
    });
    if (!post) throw new NotFoundException('Post not found');

    const [liked, related] = await Promise.all([
      viewerUserId
        ? this.prisma.blogPostLike.findUnique({
            where: { postId_userId: { postId: post.id, userId: viewerUserId } },
            select: { postId: true },
          })
        : null,
      this.related(post.id, post.categoryId),
    ]);

    const { contentHtml, ogImageKey, categoryId: _categoryId, ...rest } = post;
    return {
      ...this.toCard(rest),
      contentHtml,
      seoTitle: post.seoTitle,
      metaDescription: post.metaDescription,
      seoKeywords: post.seoKeywords,
      canonicalUrl: post.canonicalUrl,
      ogTitle: post.ogTitle,
      ogDescription: post.ogDescription,
      ogImageUrl: this.storage.publicUrlOrNull(ogImageKey),
      liked: Boolean(liked),
      related: related.map((row) => this.toCard(row)),
    };
  }

  /** Every published post's address and dates — the sitemap's input. */
  async sitemapEntries() {
    const rows = await this.prisma.blogPost.findMany({
      where: PUBLISHED,
      orderBy: { publishedAt: 'desc' },
      select: { slug: true, publishedAt: true, updatedAt: true },
      take: 5000,
    });
    return rows.map((row) => ({
      slug: row.slug,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * The article's sidebar: a handful of players and academies picked at
   * random, so a reader who came for the news leaves having met the people
   * the platform is about.
   *
   * Random in the database (`ORDER BY random()`) over the same set the public
   * directory shows — no private accounts, no disabled ones, only verified
   * academies — and shaped lean on purpose: a name, a face, a position, the
   * age band and a region. Never a date of birth (README §11.3), never
   * contacts. Two id picks and two hydrations, four cheap queries, and no
   * cache so every article view is a different six.
   */
  async spotlight(limit = SPOTLIGHT_SIZE) {
    const take = Math.min(Math.max(1, limit), SPOTLIGHT_MAX);
    const [playerIds, academyIds] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p."id"
        FROM "PlayerProfile" p
        JOIN "User" u ON u."id" = p."userId"
        WHERE u."isPrivate" = false AND u."isActive" = true
        ORDER BY random()
        LIMIT ${take}`,
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT a."id"
        FROM "AcademyProfile" a
        WHERE a."kind" = 'ACADEMY' AND a."status" = 'VERIFIED'
        ORDER BY random()
        LIMIT ${take}`,
    ]);

    const [players, academies] = await Promise.all([
      this.prisma.playerProfile.findMany({
        where: { id: { in: playerIds.map((row) => row.id) } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          birthDate: true,
          primaryPosition: true,
          region: true,
          user: { select: { username: true, avatarKey: true } },
        },
      }),
      this.prisma.academyProfile.findMany({
        where: { id: { in: academyIds.map((row) => row.id) } },
        select: {
          id: true,
          name: true,
          region: true,
          district: true,
          logoKey: true,
          trials: { where: { status: 'OPEN', type: 'GENERAL' }, select: { id: true } },
        },
      }),
    ]);

    // `IN` returns rows in storage order; put the random order back.
    const order = (ids: { id: string }[]) => new Map(ids.map((row, index) => [row.id, index]));
    const playerOrder = order(playerIds);
    const academyOrder = order(academyIds);
    const now = new Date();

    return {
      players: players
        .sort((a, b) => (playerOrder.get(a.id) ?? 0) - (playerOrder.get(b.id) ?? 0))
        .map((row) => ({
          id: row.id,
          username: row.user?.username ?? null,
          firstName: row.firstName,
          lastName: row.lastName,
          avatarUrl: this.storage.publicUrlOrNull(row.user?.avatarKey),
          primaryPosition: row.primaryPosition,
          region: row.region,
          ageBand: ageBandFor(ageAt(row.birthDate, now)),
        })),
      academies: academies
        .sort((a, b) => (academyOrder.get(a.id) ?? 0) - (academyOrder.get(b.id) ?? 0))
        .map((row) => ({
          id: row.id,
          name: row.name,
          region: row.region,
          district: row.district,
          logoUrl: this.storage.publicUrlOrNull(row.logoKey),
          openTrials: row.trials.length,
        })),
    };
  }

  /**
   * Like, or take the like back. One per person per post — the pair is the
   * key, so a second like is a no-op rather than a second row — and the
   * count on the post moves with it in the same transaction.
   */
  async setLike(slug: string, userId: string, liked: boolean) {
    const post = await this.prisma.blogPost.findFirst({
      where: { ...PUBLISHED, slug },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    const likeCount = await this.prisma.$transaction(async (tx) => {
      if (liked) {
        /*
         * `ON CONFLICT DO NOTHING` rather than create-and-catch: a unique
         * violation aborts the whole Postgres transaction, so catching P2002
         * here would leave every later statement failing with 25P02.
         */
        const { count } = await tx.blogPostLike.createMany({
          data: [{ postId: post.id, userId }],
          skipDuplicates: true,
        });
        if (count > 0) {
          await tx.blogPost.update({
            where: { id: post.id },
            data: { likeCount: { increment: 1 } },
          });
        }
      } else {
        const { count } = await tx.blogPostLike.deleteMany({
          where: { postId: post.id, userId },
        });
        if (count > 0) {
          await tx.blogPost.update({
            where: { id: post.id },
            data: { likeCount: { decrement: 1 } },
          });
        }
      }
      const row = await tx.blogPost.findUniqueOrThrow({
        where: { id: post.id },
        select: { likeCount: true },
      });
      return Math.max(0, row.likeCount);
    });

    return { liked, likeCount };
  }

  // ---------- Writing (admin) ----------

  async adminList(dto: AdminListPostsDto) {
    const { skip, take, page, pageSize } = toSkipTake(dto);
    const where: Prisma.BlogPostWhereInput = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.q ? this.searchWhere(dto.q) : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        select: { ...CARD_SELECT, status: true, createdAt: true },
      }),
      this.prisma.blogPost.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => ({ ...this.toCard(row), status: row.status, createdAt: row.createdAt })),
      total,
      { page, pageSize },
    );
  }

  /** The row as written — Markdown, keys, every SEO field — for the editor. */
  async adminGet(id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: { category: { select: CATEGORY_SELECT }, author: { select: AUTHOR_SELECT } },
    });
    if (!post) throw new NotFoundException('Post not found');
    return this.toAdminPost(post);
  }

  async create(actorId: string, dto: SavePostDto) {
    if (!dto.title || !dto.excerpt || dto.content === undefined) {
      throw new BadRequestException('A post needs a title, an excerpt and content');
    }
    const slug = await this.freeSlug(dto.slug ?? slugify(dto.title));
    const data = await this.fieldsFrom(dto);

    const post = await this.prisma.blogPost.create({
      data: {
        ...data,
        slug,
        title: dto.title,
        excerpt: dto.excerpt,
        content: dto.content,
        contentHtml: renderBlogMarkdown(dto.content),
        readingMinutes: dto.readingMinutes || readingMinutes(dto.content),
        authorUserId: actorId,
      },
      include: { category: { select: CATEGORY_SELECT }, author: { select: AUTHOR_SELECT } },
    });
    if (post.featured) await this.featureOnly(post.id);

    await this.audit.record(actorId, AuditAction.BLOG_POST_CREATED, {
      postId: post.id,
      slug: post.slug,
    });
    return this.toAdminPost(post);
  }

  /**
   * Edits the row. The slug changes only when the admin sends one — a title
   * edit never rewrites an address that may already be shared or indexed —
   * and a sent slug must be free.
   */
  async update(actorId: string, id: string, dto: SavePostDto) {
    const existing = await this.prisma.blogPost.findUnique({
      where: { id },
      select: { id: true, slug: true, content: true, readingMinutes: true },
    });
    if (!existing) throw new NotFoundException('Post not found');

    let slug: string | undefined;
    if (dto.slug !== undefined && dto.slug !== existing.slug) {
      const taken = await this.prisma.blogPost.findUnique({
        where: { slug: dto.slug },
        select: { id: true },
      });
      if (taken) throw new ConflictException('That address is already used by another post');
      slug = dto.slug;
    }

    const data = await this.fieldsFrom(dto);
    const content = dto.content ?? existing.content;
    const post = await this.prisma.blogPost.update({
      where: { id },
      data: {
        ...data,
        ...(slug ? { slug } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.excerpt !== undefined ? { excerpt: dto.excerpt } : {}),
        ...(dto.content !== undefined
          ? { content: dto.content, contentHtml: renderBlogMarkdown(dto.content) }
          : {}),
        readingMinutes:
          dto.readingMinutes !== undefined
            ? dto.readingMinutes || readingMinutes(content)
            : dto.content !== undefined
              ? readingMinutes(content)
              : existing.readingMinutes,
      },
      include: { category: { select: CATEGORY_SELECT }, author: { select: AUTHOR_SELECT } },
    });
    if (post.featured && dto.featured) await this.featureOnly(post.id);
    return this.toAdminPost(post);
  }

  /**
   * Publishes. `publishedAt` is set the first time only, so the page's
   * `datePublished` stays the first date across an unpublish and a
   * republish; `dateModified` is `updatedAt`, which moves on every edit.
   */
  async publish(actorId: string, id: string) {
    const existing = await this.prisma.blogPost.findUnique({
      where: { id },
      select: { publishedAt: true, title: true, excerpt: true, content: true },
    });
    if (!existing) throw new NotFoundException('Post not found');
    if (!existing.title.trim() || !existing.excerpt.trim() || !existing.content.trim()) {
      throw new BadRequestException('Give the post a title, an excerpt and some content first');
    }
    const post = await this.prisma.blogPost.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: existing.publishedAt ?? new Date() },
      include: { category: { select: CATEGORY_SELECT }, author: { select: AUTHOR_SELECT } },
    });
    await this.audit.record(actorId, AuditAction.BLOG_POST_PUBLISHED, {
      postId: id,
      slug: post.slug,
    });
    return this.toAdminPost(post);
  }

  async unpublish(actorId: string, id: string) {
    const post = await this.prisma.blogPost
      .update({
        where: { id },
        data: { status: 'DRAFT', featured: false },
        include: { category: { select: CATEGORY_SELECT }, author: { select: AUTHOR_SELECT } },
      })
      .catch(() => null);
    if (!post) throw new NotFoundException('Post not found');
    await this.audit.record(actorId, AuditAction.BLOG_POST_UNPUBLISHED, {
      postId: id,
      slug: post.slug,
    });
    return this.toAdminPost(post);
  }

  /** Gone for good, pictures included. The likes cascade with the row. */
  async remove(actorId: string, id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        coverKey: true,
        ogImageKey: true,
        images: { select: { storageKey: true } },
      },
    });
    if (!post) throw new NotFoundException('Post not found');
    await this.prisma.blogPost.delete({ where: { id } });
    const keys = [post.coverKey, post.ogImageKey, ...post.images.map((row) => row.storageKey)];
    for (const key of keys) {
      if (key) await this.storage.deleteObject(key).catch(() => undefined);
    }
    await this.audit.record(actorId, AuditAction.BLOG_POST_DELETED, {
      postId: id,
      slug: post.slug,
    });
    return { deleted: true };
  }

  /**
   * A presigned PUT for a post's cover or share image, under the post's own
   * directory. The key is minted here; the client cannot steer it.
   */
  async imageUploadUrl(postId: string, dto: BlogImageUploadDto) {
    await this.assertPost(postId);
    if (dto.contentType && !isImageType(dto.contentType)) {
      throw new BadRequestException('Only images can be uploaded here');
    }
    const storageKey = blogMediaKey(postId, dto.filename);
    const signed = await this.storage.createUploadUrl(storageKey, dto.contentType);
    return { ...signed, publicUrl: this.storage.publicUrlOrNull(storageKey) };
  }

  // ---------- Body images (admin) ----------

  /**
   * The pictures uploaded for a post's body, newest first, each with the
   * public URL an admin pastes into the Markdown. Keys stay on the server.
   */
  async listImages(postId: string) {
    await this.assertPost(postId);
    const rows = await this.prisma.blogPostImage.findMany({
      where: { postId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toImage(row));
  }

  /**
   * Records an image the browser has just PUT to storage.
   *
   * The key must be one this post's upload ticket could have minted — under
   * the post's own directory — and the object must actually be there and be
   * an image. A confirmation for something that never arrived, or for a file
   * that is not a picture, is refused and the stray object removed, so the
   * list never shows a broken thumbnail and the bucket never keeps a payload
   * nobody can display.
   */
  async confirmImage(postId: string, dto: ConfirmBlogImageDto) {
    await this.assertPost(postId);
    assertKeyUnder(dto.storageKey, blogMediaPrefix(postId));

    const head = await this.storage.describeObject(dto.storageKey);
    if (!head) throw new BadRequestException('The image has not been uploaded yet');
    if (head.contentType && !isImageType(head.contentType)) {
      await this.storage.deleteObject(dto.storageKey).catch(() => undefined);
      throw new BadRequestException('Only images can be uploaded here');
    }

    const existing = await this.prisma.blogPostImage.findUnique({
      where: { storageKey: dto.storageKey },
    });
    if (existing) return this.toImage(existing);

    const row = await this.prisma.blogPostImage.create({
      data: {
        postId,
        storageKey: dto.storageKey,
        filename: dto.storageKey.slice(dto.storageKey.lastIndexOf('/') + 1),
        contentType: head.contentType ?? null,
        size: head.size,
      },
    });
    return this.toImage(row);
  }

  /** Removes the object and its row. Deleting twice is not an error. */
  async deleteImage(postId: string, imageId: string) {
    const row = await this.prisma.blogPostImage.findFirst({ where: { id: imageId, postId } });
    if (!row) throw new NotFoundException('Image not found');
    await this.storage.deleteObject(row.storageKey).catch(() => undefined);
    await this.prisma.blogPostImage.delete({ where: { id: row.id } }).catch(() => undefined);
    return { deleted: true };
  }

  private toImage(row: {
    id: string;
    filename: string;
    storageKey: string;
    contentType: string | null;
    size: number;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      filename: row.filename,
      url: this.storage.publicUrlOrNull(row.storageKey),
      contentType: row.contentType,
      size: row.size,
      createdAt: row.createdAt,
    };
  }

  private async assertPost(postId: string) {
    const exists = await this.prisma.blogPost.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Post not found');
  }

  // ---------- Categories (admin) ----------

  async createCategory(dto: SaveCategoryDto) {
    if (!dto.name) throw new BadRequestException('A category needs a name');
    const slug = await uniqueSlug(dto.slug ?? slugify(dto.name), async (candidate) =>
      Boolean(
        await this.prisma.blogCategory.findUnique({
          where: { slug: candidate },
          select: { id: true },
        }),
      ),
    );
    return this.prisma.blogCategory.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateCategory(id: string, dto: SaveCategoryDto) {
    if (dto.slug) {
      const taken = await this.prisma.blogCategory.findUnique({
        where: { slug: dto.slug },
        select: { id: true },
      });
      if (taken && taken.id !== id) throw new ConflictException('That address is already used');
    }
    const category = await this.prisma.blogCategory
      .update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      })
      .catch(() => null);
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  /** Removes the category; its posts keep their rows and lose the label. */
  async removeCategory(id: string) {
    const category = await this.prisma.blogCategory.delete({ where: { id } }).catch(() => null);
    if (!category) throw new NotFoundException('Category not found');
    return { deleted: true };
  }

  // ---------- Helpers ----------

  private searchWhere(q: string): Prisma.BlogPostWhereInput {
    const needle = q.trim();
    if (!needle) return {};
    return {
      OR: [
        { title: { contains: needle, mode: 'insensitive' } },
        { excerpt: { contains: needle, mode: 'insensitive' } },
      ],
    };
  }

  private async related(postId: string, categoryId: string | null) {
    const inCategory = categoryId
      ? await this.prisma.blogPost.findMany({
          where: { ...PUBLISHED, categoryId, id: { not: postId } },
          orderBy: { publishedAt: 'desc' },
          take: RELATED,
          select: CARD_SELECT,
        })
      : [];
    if (inCategory.length >= RELATED) return inCategory;
    const filler = await this.prisma.blogPost.findMany({
      where: { ...PUBLISHED, id: { notIn: [postId, ...inCategory.map((row) => row.id)] } },
      orderBy: { publishedAt: 'desc' },
      take: RELATED - inCategory.length,
      select: CARD_SELECT,
    });
    return [...inCategory, ...filler];
  }

  private async freeSlug(base: string) {
    return uniqueSlug(base, async (candidate) =>
      Boolean(
        await this.prisma.blogPost.findUnique({ where: { slug: candidate }, select: { id: true } }),
      ),
    );
  }

  /** The one featured post: featuring this one un-features the others. */
  private async featureOnly(postId: string) {
    await this.prisma.blogPost.updateMany({
      where: { featured: true, id: { not: postId } },
      data: { featured: false },
    });
  }

  /** The optional fields of a save, checked and normalised for Prisma. */
  private async fieldsFrom(dto: SavePostDto) {
    const data: {
      coverKey?: string | null;
      ogImageKey?: string | null;
      coverAlt?: string | null;
      authorName?: string | null;
      featured?: boolean;
      seoTitle?: string | null;
      metaDescription?: string | null;
      ogTitle?: string | null;
      ogDescription?: string | null;
      seoKeywords?: string[];
      canonicalUrl?: string | null;
      categoryId?: string | null;
    } = {};

    for (const field of ['coverKey', 'ogImageKey'] as const) {
      const key = dto[field];
      if (key === undefined) continue;
      if (key === '') {
        data[field] = null;
        continue;
      }
      assertKeyUnder(key, `${PUBLIC_PREFIX}blog/`);
      data[field] = key;
    }
    if (dto.coverAlt !== undefined) data.coverAlt = dto.coverAlt.trim() || null;
    if (dto.authorName !== undefined) data.authorName = dto.authorName.trim() || null;
    if (dto.featured !== undefined) data.featured = dto.featured;
    if (dto.seoTitle !== undefined) data.seoTitle = dto.seoTitle.trim() || null;
    if (dto.metaDescription !== undefined)
      data.metaDescription = dto.metaDescription.trim() || null;
    if (dto.ogTitle !== undefined) data.ogTitle = dto.ogTitle.trim() || null;
    if (dto.ogDescription !== undefined) data.ogDescription = dto.ogDescription.trim() || null;
    if (dto.seoKeywords !== undefined) {
      data.seoKeywords = [...new Set(dto.seoKeywords.map((k) => k.trim()).filter(Boolean))];
    }
    if (dto.canonicalUrl !== undefined) {
      const trimmed = dto.canonicalUrl.trim();
      if (trimmed) {
        let url: URL;
        try {
          url = new URL(trimmed);
        } catch {
          throw new BadRequestException('The canonical URL is not a valid address');
        }
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
          throw new BadRequestException('The canonical URL must start with https://');
        }
      }
      data.canonicalUrl = trimmed || null;
    }
    if (dto.categoryId !== undefined) {
      if (dto.categoryId === '') {
        data.categoryId = null;
      } else {
        const category = await this.prisma.blogCategory.findUnique({
          where: { id: dto.categoryId },
          select: { id: true },
        });
        if (!category) throw new BadRequestException('That category does not exist');
        data.categoryId = dto.categoryId;
      }
    }
    return data;
  }

  private authorOf(row: {
    author: Prisma.UserGetPayload<{ select: typeof AUTHOR_SELECT }>;
    authorName: string | null;
  }) {
    const name =
      row.authorName?.trim() ||
      [row.author.firstName, row.author.lastName].filter(Boolean).join(' ') ||
      row.author.username ||
      'FotSpot';
    return { name, avatarUrl: this.storage.publicUrlOrNull(row.author.avatarKey) };
  }

  private toCard(row: CardRow) {
    const { coverKey, author: _author, authorName: _authorName, ...rest } = row;
    return {
      ...rest,
      coverUrl: this.storage.publicUrlOrNull(coverKey),
      author: this.authorOf(row),
    };
  }

  private toAdminPost(
    post: Prisma.BlogPostGetPayload<{
      include: {
        category: { select: typeof CATEGORY_SELECT };
        author: { select: typeof AUTHOR_SELECT };
      };
    }>,
  ) {
    return {
      ...post,
      coverUrl: this.storage.publicUrlOrNull(post.coverKey),
      ogImageUrl: this.storage.publicUrlOrNull(post.ogImageKey),
      author: this.authorOf(post),
      plainText: markdownToPlainText(post.content).slice(0, 300),
    };
  }
}
