import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Building2, CalendarDays, Clock, Search, Users } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { blog } from '@/lib/api/resources';
import type { BlogPost } from '@/lib/api/types';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import { absoluteUrl, jsonLd } from '@/lib/seo';
import { breadcrumbLd } from '@/lib/structured-data';
import { categoryPath, metaDescriptionFor, postPath } from '@/lib/blog';
import { ArticleBody } from '@/components/blog/ArticleBody';
import { LikeButton } from '@/components/blog/LikeButton';
import { BlogAside } from '@/components/blog/BlogAside';
import { PostCard } from '@/components/blog/PostCard';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { LoadingImage } from '@/components/ui/LoadingImage';
import { formatDate, initials } from '@/lib/utils';

export const revalidate = 60;

async function load(slug: string, token?: string): Promise<BlogPost | null> {
  try {
    return await blog.bySlug(slug, token ? { token, cache: 'no-store' } : { revalidate });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Everything a search result and a share card need, from the post's own
 * SEO fields with the article as the fallback for each. The canonical is
 * the post's address unless an admin set another — a piece syndicated from
 * elsewhere points home.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await load(slug);
  if (!post) return { title: 'FotSpot', robots: { index: false, follow: false } };

  const title = post.seoTitle?.trim() || post.title;
  const description = metaDescriptionFor(post);
  const url = absoluteUrl(postPath(post));
  const image = post.ogImageUrl ?? post.coverUrl ?? absoluteUrl('/fotspot.png');

  return {
    title,
    description,
    keywords: post.seoKeywords.length ? post.seoKeywords : undefined,
    alternates: { canonical: post.canonicalUrl?.trim() || url },
    openGraph: {
      type: 'article',
      url,
      title: post.ogTitle?.trim() || title,
      description: post.ogDescription?.trim() || description,
      images: [{ url: image, alt: post.coverAlt ?? post.title }],
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      authors: [post.author.name],
      section: post.category?.name,
      tags: post.seoKeywords,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.ogTitle?.trim() || title,
      description: post.ogDescription?.trim() || description,
      images: [image],
    },
    robots: { index: true, follow: true },
  };
}

/**
 * One article, laid out to be read.
 *
 * A measured column, the cover across the top, the standfirst under the
 * title, the byline and the two facts a reader wants before committing —
 * when, and how long — then the body, the like, what to read next, and
 * where the story leads on FotSpot. A Server Component: the article is in
 * the HTML with `Article` markup naming its dates and author, and the only
 * script is the heart.
 *
 * NOTE (Next 16): `params` is a Promise.
 */
export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  const { t } = await getServerT();
  // With a session the read is personal — `liked` — and skips the shared cache.
  // The sidebar is a different six on every view, and losing it must not lose
  // the article, so it is fetched beside the post and tolerated when it fails.
  const [post, spotlight] = await Promise.all([
    load(slug, session?.accessToken),
    blog.spotlight({ cache: 'no-store' }).catch(() => null),
  ]);
  if (!post) notFound();

  const description = metaDescriptionFor(post);
  const image = post.ogImageUrl ?? post.coverUrl;

  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description,
    ...(image ? { image: [image] } : {}),
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt,
    author: { '@type': 'Person', name: post.author.name },
    publisher: {
      '@type': 'Organization',
      name: 'FotSpot',
      url: absoluteUrl('/'),
      logo: { '@type': 'ImageObject', url: absoluteUrl('/fotspot.png') },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(postPath(post)) },
    ...(post.category ? { articleSection: post.category.name } : {}),
    ...(post.seoKeywords.length ? { keywords: post.seoKeywords.join(', ') } : {}),
    inLanguage: 'uz',
  };

  return (
    <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-10">
      <article className="mx-auto w-full max-w-3xl min-w-0">
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(article)} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLd(
            breadcrumbLd([
              { name: t.blog.title, path: '/blog' },
              ...(post.category
                ? [{ name: post.category.name, path: categoryPath(post.category.slug) }]
                : []),
              { name: post.title, path: postPath(post) },
            ]),
          )}
        />

        <nav className="mb-5">
          <Link
            href="/blog"
            className="text-muted hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" aria-hidden /> {t.blog.title}
          </Link>
        </nav>

        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {post.category && (
              <Link href={categoryPath(post.category.slug)}>
                <Badge variant="primary">{post.category.name}</Badge>
              </Link>
            )}
            {post.featured && <Badge variant="accent">{t.blog.featured}</Badge>}
          </div>
          <h1 className="text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl md:text-5xl">
            {post.title}
          </h1>
          <p className="text-muted text-lg leading-relaxed sm:text-xl">{post.excerpt}</p>

          <div className="border-border flex flex-wrap items-center gap-x-5 gap-y-3 border-y py-3 text-sm">
            <span className="flex items-center gap-2">
              <Avatar
                src={post.author.avatarUrl}
                fallback={initials(post.author.name.split(' ')[0], post.author.name.split(' ')[1])}
                className="size-8 text-xs"
              />
              <span className="font-medium">{post.author.name}</span>
            </span>
            {post.publishedAt && (
              <span className="text-muted flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden />
                <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
              </span>
            )}
            <span className="text-muted flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden />
              {post.readingMinutes} {t.blog.minRead}
            </span>
            <span className="ml-auto">
              <LikeButton slug={post.slug} liked={post.liked} likeCount={post.likeCount} />
            </span>
          </div>
        </header>

        {post.coverUrl && (
          <figure className="mt-6">
            <div className="bg-surface-2 relative aspect-[16/9] w-full overflow-hidden rounded-2xl">
              <LoadingImage
                src={post.coverUrl}
                alt={post.coverAlt ?? post.title}
                fetchPriority="high"
                className="absolute inset-0 size-full object-cover"
              />
            </div>
            {post.coverAlt && (
              <figcaption className="text-muted mt-2 text-center text-xs">
                {post.coverAlt}
              </figcaption>
            )}
          </figure>
        )}

        <div className="mt-8">
          <ArticleBody html={post.contentHtml} />
        </div>

        <footer className="border-border mt-10 space-y-10 border-t pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted text-sm">{t.blog.likePrompt}</p>
            <LikeButton slug={post.slug} liked={post.liked} likeCount={post.likeCount} size="lg" />
          </div>

          {/* Where the story leads on the platform — every article links the
            three things FotSpot is for, so a reader who arrived from a search
            has somewhere to go, and a crawler has the paths. */}
          <section className="space-y-3">
            <h2 className="text-base font-bold">{t.blog.exploreTitle}</h2>
            <ul className="grid gap-3 sm:grid-cols-3">
              <ExploreLink
                href="/players"
                icon={Search}
                title={t.nav.players}
                hint={t.blog.explorePlayers}
              />
              <ExploreLink
                href="/academies"
                icon={Building2}
                title={t.nav.academies}
                hint={t.blog.exploreAcademies}
              />
              <ExploreLink
                href="/trials"
                icon={Users}
                title={t.nav.trials}
                hint={t.blog.exploreTrials}
              />
            </ul>
          </section>

          {post.related.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xl font-bold">{t.blog.related}</h2>
              <ul className="grid gap-5 sm:grid-cols-3">
                {post.related.map((row) => (
                  <li key={row.id}>
                    <PostCard post={row} t={t} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </footer>
      </article>

      {/* Beside the article on a wide screen, after it on a phone — the story
        first, then the people it is about. */}
      {spotlight && (
        <aside className="mt-10 lg:mt-0" aria-label={t.blog.asidePlayers}>
          <BlogAside spotlight={spotlight} t={t} />
        </aside>
      )}
    </div>
  );
}

function ExploreLink({
  href,
  icon: Icon,
  title,
  hint,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="border-border hover:bg-surface-2 flex items-start gap-3 rounded-xl border p-3 transition-colors"
      >
        <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="text-muted block text-xs">{hint}</span>
        </span>
      </Link>
    </li>
  );
}
