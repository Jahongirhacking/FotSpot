import Link from 'next/link';
import { Clock, Heart, ImageOff } from 'lucide-react';
import type { BlogPostCard } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n/dictionaries/uz';
import { LoadingImage } from '@/components/ui/LoadingImage';
import { Badge } from '@/components/ui/Badge';
import { categoryPath, postPath } from '@/lib/blog';
import { cn, formatDate } from '@/lib/utils';

/**
 * One article on a listing — cover, category, title, standfirst, and the
 * three facts a reader weighs before opening it: when, how long, how liked.
 *
 * A server component: nothing on it is interactive, so it costs the page no
 * script, and a grid of twelve renders as HTML a crawler reads whole.
 * `variant="row"` is the compact form the sidebars use: the same facts, the
 * picture beside the words rather than above them.
 */
export function PostCard({
  post,
  t,
  variant = 'card',
  priority = false,
}: {
  post: BlogPostCard;
  t: Dictionary;
  variant?: 'card' | 'row';
  /** True for the pictures above the fold, so they are not lazy-loaded. */
  priority?: boolean;
}) {
  const href = postPath(post);
  const facts = (
    <p className="text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {post.publishedAt && <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>}
      <span className="flex items-center gap-1">
        <Clock className="size-3" aria-hidden />
        {post.readingMinutes} {t.blog.minRead}
      </span>
      {post.likeCount > 0 && (
        <span className="flex items-center gap-1">
          <Heart className="size-3" aria-hidden />
          {post.likeCount}
        </span>
      )}
    </p>
  );

  if (variant === 'row') {
    return (
      <article className="flex gap-3">
        <Link
          href={href}
          className="bg-surface-2 relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-lg sm:w-28"
          aria-hidden
          tabIndex={-1}
        >
          <Cover post={post} priority={priority} />
        </Link>
        <div className="min-w-0 flex-1 space-y-1">
          {post.category && (
            <Link
              href={categoryPath(post.category.slug)}
              className="text-primary text-[11px] font-semibold tracking-wide uppercase hover:underline"
            >
              {post.category.name}
            </Link>
          )}
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold">
            <Link href={href} className="hover:underline">
              {post.title}
            </Link>
          </h3>
          {facts}
        </div>
      </article>
    );
  }

  return (
    <article className="group border-border bg-surface flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-lg">
      <Link
        href={href}
        className="bg-surface-2 relative aspect-[16/9] w-full overflow-hidden"
        aria-hidden
        tabIndex={-1}
      >
        <Cover post={post} priority={priority} />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          {post.category ? (
            <Link href={categoryPath(post.category.slug)} className="hover:underline">
              <Badge variant="primary">{post.category.name}</Badge>
            </Link>
          ) : (
            <Badge variant="neutral">{t.blog.uncategorised}</Badge>
          )}
        </div>
        <h3 className="line-clamp-2 text-lg leading-snug font-bold">
          <Link href={href} className="hover:underline">
            {post.title}
          </Link>
        </h3>
        <p className="text-muted line-clamp-3 text-sm">{post.excerpt}</p>
        <div className="mt-auto pt-1">{facts}</div>
      </div>
    </article>
  );
}

function Cover({ post, priority }: { post: BlogPostCard; priority: boolean }) {
  if (!post.coverUrl) {
    return (
      <span className="text-muted grid size-full place-items-center">
        <ImageOff className="size-6" aria-hidden />
      </span>
    );
  }
  return (
    <LoadingImage
      src={post.coverUrl}
      alt={post.coverAlt ?? post.title}
      spinner={false}
      className={cn(
        'absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]',
      )}
      {...(priority ? { fetchPriority: 'high' as const } : {})}
    />
  );
}
