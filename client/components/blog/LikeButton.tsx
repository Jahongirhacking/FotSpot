'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useI18n } from '@/components/layout/I18nProvider';
import { cn } from '@/lib/utils';

/**
 * The one interactive thing on an article: like it, or take the like back.
 *
 * Optimistic, because a heart that fills a second after the press feels
 * broken: the count and the fill change on press and are put back if the
 * request fails. A guest is sent to sign in and brought back to the article
 * — reading needs no account; liking does. One like per person is the
 * API's rule; a second press here is an unlike.
 */
export function LikeButton({
  slug,
  liked: initialLiked,
  likeCount: initialCount,
  size = 'md',
}: {
  slug: string;
  liked: boolean;
  likeCount: number;
  size?: 'md' | 'lg';
}) {
  const { t, f } = useI18n();
  const requireAuth = useRequireAuth();
  const [liked, setLiked] = React.useState(initialLiked);
  const [count, setCount] = React.useState(initialCount);

  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      browserFetch<{ liked: boolean; likeCount: number }>(
        `/blog/posts/${encodeURIComponent(slug)}/like`,
        { method: next ? 'POST' : 'DELETE' },
      ),
    onMutate: (next) => {
      const before = { liked, count };
      setLiked(next);
      setCount((current) => Math.max(0, current + (next ? 1 : -1)));
      return before;
    },
    onSuccess: (result) => {
      setLiked(result.liked);
      setCount(result.likeCount);
    },
    onError: (_error, _next, before) => {
      if (before) {
        setLiked(before.liked);
        setCount(before.count);
      }
    },
  });

  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={liked ? t.blog.unlike : t.blog.like}
      title={liked ? t.blog.unlike : t.blog.like}
      disabled={toggle.isPending}
      onClick={() => {
        if (!requireAuth()) return;
        toggle.mutate(!liked);
      }}
      className={cn(
        'border-border inline-flex items-center gap-2 rounded-full border font-medium transition-colors',
        'hover:border-danger/50 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
        size === 'lg' ? 'min-h-11 px-4 text-sm' : 'min-h-9 px-3 text-xs',
        liked ? 'border-danger/40 bg-danger/10 text-danger' : 'bg-surface',
      )}
    >
      <Heart
        className={cn(size === 'lg' ? 'size-4' : 'size-3.5', liked && 'fill-current')}
        aria-hidden
      />
      <span>{f(t.blog.likes, { count })}</span>
    </button>
  );
}
