import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Flame, Newspaper, Sparkles, TrendingUp } from 'lucide-react';
import { blog } from '@/lib/api/resources';
import type { BlogHome, BlogPostCard } from '@/lib/api/types';
import type { Page } from '@/lib/api/client';
import { getServerT } from '@/lib/i18n/server';
import { jsonLd, pageMetadata } from '@/lib/seo';
import { breadcrumbLd, itemListLd } from '@/lib/structured-data';
import { categoryPath, postPath } from '@/lib/blog';
import { PostCard } from '@/components/blog/PostCard';
import { FeaturedPost } from '@/components/blog/FeaturedPost';
import { BlogSearch } from '@/components/blog/BlogSearch';
import { Pagination } from '@/components/shared/Pagination';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Feedback';
import { cn } from '@/lib/utils';

/** Refreshed every minute for a guest; a signed-in reader gets the same page. */
export const revalidate = 60;

const PAGE_SIZE = 12;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return pageMetadata({
    path: '/blog',
    title: `${t.blog.title} — FotSpot`,
    description: t.blog.tagline,
  });
}

/**
 * The blog's front page — an editorial front, not a list.
 *
 * ## The shape
 *
 * The featured story leads, full width. Under it the categories, then three
 * bands a reader of a football site expects: the latest, what this week
 * liked, and the all-time top. Narrowed by a category or a search, the page
 * becomes the plain paged list of what matched — the bands are a front
 * page's business, not a result's.
 *
 * ## Everything here is HTML
 *
 * The page is a Server Component fed by two public API reads. Nothing on it
 * needs script but the search box, so a crawler reads every headline and
 * every link, and the `ItemList` markup says which pages they lead to.
 *
 * NOTE (Next 16): `searchParams` is a Promise.
 */
export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; page?: string; sort?: string }>;
}) {
  const { t } = await getServerT();
  const params = await searchParams;
  const category = params?.category?.trim() || undefined;
  const q = params?.q?.trim() || undefined;
  const sort = params?.sort === 'top' ? 'top' : undefined;
  const page = Number(params?.page ?? 1) || 1;
  const narrowed = Boolean(category || q || sort || page > 1);

  const empty: BlogHome = { featured: null, latest: [], thisWeek: [], top: [], categories: [] };
  const emptyPage: Page<BlogPostCard> = { items: [], total: 0, page, pageSize: PAGE_SIZE };

  const [home, list] = await Promise.all([
    blog.home({ revalidate }).catch(() => empty),
    narrowed
      ? blog
          .list({ category, q, sort, page, pageSize: PAGE_SIZE }, { revalidate })
          .catch(() => emptyPage)
      : Promise.resolve(emptyPage),
  ]);

  const activeCategory = home.categories.find((row) => row.slug === category) ?? null;
  const listed = narrowed
    ? list.items
    : [...(home.featured ? [home.featured] : []), ...home.latest];

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      {listed.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLd(
            itemListLd(
              listed.slice(0, 20).map((post) => ({ name: post.title, path: postPath(post) })),
            ),
          )}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(breadcrumbLd([{ name: t.blog.title, path: '/blog' }]))}
      />

      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-primary flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
              <Newspaper className="size-3.5" aria-hidden /> FotSpot
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{t.blog.title}</h1>
            <p className="text-muted mt-1 max-w-xl text-sm sm:text-base">{t.blog.tagline}</p>
          </div>
          <BlogSearch initial={q ?? ''} />
        </div>

        {/* The categories, as a row of chips a thumb can work; the active
            one is the filled chip. "All" is the way back. */}
        {home.categories.length > 0 && (
          <nav
            aria-label={t.blog.categories}
            className="-mx-1 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
          >
            <Chip href="/blog" active={!category && !sort}>
              {t.blog.allPosts}
            </Chip>
            <Chip href="/blog?sort=top" active={sort === 'top'}>
              <Flame className="size-3.5" aria-hidden /> {t.blog.top}
            </Chip>
            {home.categories.map((row) => (
              <Chip key={row.id} href={categoryPath(row.slug)} active={row.slug === category}>
                {row.name}
                {row.postCount ? (
                  <span className="text-muted ml-1 text-[11px]">{row.postCount}</span>
                ) : null}
              </Chip>
            ))}
          </nav>
        )}
      </header>

      {narrowed ? (
        <section className="space-y-4">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold">
            {sort === 'top'
              ? t.blog.topPosts
              : activeCategory
                ? activeCategory.name
                : q
                  ? t.blog.results
                  : t.blog.latest}
            {q && <Badge variant="neutral">“{q}”</Badge>}
            <span className="text-muted text-sm font-normal">{list.total}</span>
          </h2>
          {activeCategory?.description && (
            <p className="text-muted max-w-2xl text-sm">{activeCategory.description}</p>
          )}
          {list.items.length === 0 ? (
            <EmptyState
              icon={Newspaper}
              title={t.blog.nothingFound}
              description={t.blog.nothingFoundHint}
            />
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {list.items.map((post, index) => (
                <li key={post.id}>
                  <PostCard post={post} t={t} priority={index < 3} />
                </li>
              ))}
            </ul>
          )}
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} />
        </section>
      ) : home.featured ? (
        <>
          <FeaturedPost post={home.featured} t={t} />

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="space-y-4">
              <SectionTitle icon={Sparkles} title={t.blog.latest} />
              {home.latest.length === 0 ? (
                <p className="text-muted text-sm">{t.blog.onlyOneSoFar}</p>
              ) : (
                <ul className="grid gap-5 sm:grid-cols-2">
                  {home.latest.map((post, index) => (
                    <li key={post.id}>
                      <PostCard post={post} t={t} priority={index < 2} />
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <Link
                  href="/blog?page=2"
                  className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
                >
                  {t.blog.olderPosts} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </section>

            <aside className="space-y-8">
              {home.thisWeek.length > 0 && (
                <section className="space-y-3">
                  <SectionTitle icon={TrendingUp} title={t.blog.thisWeek} small />
                  <ul className="space-y-4">
                    {home.thisWeek.map((post) => (
                      <li key={post.id}>
                        <PostCard post={post} t={t} variant="row" />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {home.top.length > 0 && (
                <section className="space-y-3">
                  <SectionTitle icon={Flame} title={t.blog.topPosts} small />
                  <ol className="space-y-4">
                    {home.top.map((post, index) => (
                      <li key={post.id} className="flex gap-3">
                        <span className="text-primary/60 w-5 shrink-0 text-2xl leading-none font-black tabular-nums">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <PostCard post={post} t={t} variant="row" />
                        </div>
                      </li>
                    ))}
                  </ol>
                  <Link
                    href="/blog?sort=top"
                    className="text-primary text-sm font-medium hover:underline"
                  >
                    {t.blog.seeAllTop}
                  </Link>
                </section>
              )}
            </aside>
          </div>
        </>
      ) : (
        <EmptyState
          icon={Newspaper}
          title={t.blog.nothingYet}
          description={t.blog.nothingYetHint}
        />
      )}
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  small = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  small?: boolean;
}) {
  return (
    <h2 className={cn('flex items-center gap-2 font-bold', small ? 'text-base' : 'text-xl')}>
      <Icon className="text-primary size-4" aria-hidden /> {title}
    </h2>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium whitespace-nowrap transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border hover:border-primary/50',
      )}
    >
      {children}
    </Link>
  );
}
