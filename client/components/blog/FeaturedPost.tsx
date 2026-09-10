import Link from 'next/link';
import { ArrowRight, Clock, Heart } from 'lucide-react';
import type { BlogPostCard } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n/dictionaries/uz';
import { LoadingImage } from '@/components/ui/LoadingImage';
import { Badge } from '@/components/ui/Badge';
import { categoryPath, postPath } from '@/lib/blog';
import { formatDate } from '@/lib/utils';

/**
 * The lead story: the picture full-bleed, the words over its foot. What a
 * front page opens on, and the one image on the page fetched eagerly.
 */
export function FeaturedPost({ post, t }: { post: BlogPostCard; t: Dictionary }) {
  const href = postPath(post);
  return (
    <article className="group border-border relative overflow-hidden rounded-3xl border bg-black text-white">
      <Link href={href} className="block" aria-label={post.title}>
        <div className="relative aspect-[16/10] w-full sm:aspect-[21/9]">
          {post.coverUrl && (
            <LoadingImage
              src={post.coverUrl}
              alt={post.coverAlt ?? post.title}
              spinner={false}
              fetchPriority="high"
              className="absolute inset-0 size-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-[1.02]"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        </div>
      </Link>
      <div className="absolute inset-x-0 bottom-0 space-y-3 p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="primary" className="bg-primary text-primary-foreground">
            {t.blog.featured}
          </Badge>
          {post.category && (
            <Link
              href={categoryPath(post.category.slug)}
              className="text-xs font-semibold tracking-wide uppercase hover:underline"
            >
              {post.category.name}
            </Link>
          )}
        </div>
        <h2 className="max-w-3xl text-2xl leading-tight font-extrabold tracking-tight sm:text-4xl">
          <Link href={href} className="hover:underline">
            {post.title}
          </Link>
        </h2>
        <p className="line-clamp-2 max-w-2xl text-sm text-white/85 sm:text-base">{post.excerpt}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/75">
          <span>{post.author.name}</span>
          {post.publishedAt && (
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          )}
          <span className="flex items-center gap-1">
            <Clock className="size-3" aria-hidden /> {post.readingMinutes} {t.blog.minRead}
          </span>
          {post.likeCount > 0 && (
            <span className="flex items-center gap-1">
              <Heart className="size-3" aria-hidden /> {post.likeCount}
            </span>
          )}
          <Link
            href={href}
            className="ml-auto inline-flex items-center gap-1 font-medium text-white hover:underline"
          >
            {t.blog.readMore} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}
