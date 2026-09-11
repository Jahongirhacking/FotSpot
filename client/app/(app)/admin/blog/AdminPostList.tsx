'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { LoadingImage } from '@/components/ui/LoadingImage';
import type { BlogPostCard, BlogPostStatus } from '@/lib/api/types';
import { authorDisplay, postPath } from '@/lib/blog';
import { cn, formatDateTime } from '@/lib/utils';
import { ExternalLink, FileText, Pencil, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

type Row = BlogPostCard & { status: BlogPostStatus; createdAt: string };

/**
 * Every post, at every status, as rows an editor works down: the picture,
 * the headline, where it stands, when it was last touched. The status
 * filter and the search live in the URL, so a view survives a reload and
 * the server does the paging.
 */
export function AdminPostList({
  items,
  total,
  status,
  q,
}: {
  items: Row[];
  total: number;
  status?: BlogPostStatus;
  q?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigate = (next: { status?: string; q?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.push(query ? `/admin/blog?${query}` : '/admin/blog');
  };

  const tabs: { value?: BlogPostStatus; label: string }[] = [
    { value: undefined, label: t.blog.allStatuses },
    { value: 'DRAFT', label: t.blog.drafts },
    { value: 'PUBLISHED', label: t.blog.published },
  ];

  return (
    <div className="space-y-3">
      {/* Tabs on one row, search on the next on a phone; one row from sm up. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div role="tablist" className="bg-surface-2 grid grid-cols-3 gap-1 rounded-lg p-1 sm:flex">
          {tabs.map((tab) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={tab.value === status}
              onClick={() => navigate({ status: tab.value })}
              className={cn(
                'min-h-10 rounded-md px-3 text-sm font-medium transition-colors sm:min-h-9',
                tab.value === status ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <form
          role="search"
          className="relative min-w-0 flex-1 sm:max-w-xs"
          onSubmit={(event) => {
            event.preventDefault();
            const value = (new FormData(event.currentTarget).get('q') as string) ?? '';
            navigate({ q: value.trim() });
          }}
        >
          <Search
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q ?? ''}
            placeholder={t.blog.searchPlaceholder}
            aria-label={t.blog.search}
            className="pl-9"
          />
        </form>
        <span className="text-muted text-sm sm:ml-auto">
          {total} · {t.blog.posts.toLowerCase()}
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t.blog.noPosts}
          description={t.blog.noPostsHint}
          action={
            <Button asChild>
              <Link href="/admin/blog/new">{t.blog.newPost}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {items.map((post) => (
            <li key={post.id}>
              <Card>
                {/* A phone gets the cover across the top and the actions along
                    the bottom; a laptop gets one row. */}
                <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                  <Link
                    href={`/admin/blog/${post.id}`}
                    className={cn(
                      'bg-surface-2 relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-lg sm:aspect-[16/10] sm:w-28',
                      // A blank frame the height of a photo tells a phone reader
                      // nothing; the small square on a laptop is fine empty.
                      !post.coverUrl && 'hidden sm:block',
                    )}
                    aria-hidden
                    tabIndex={-1}
                  >
                    {post.coverUrl && (
                      <LoadingImage
                        src={post.coverUrl}
                        alt=""
                        spinner={false}
                        className="absolute inset-0 size-full object-cover"
                      />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/blog/${post.id}`}
                        className="line-clamp-1 font-semibold hover:underline"
                      >
                        {post.title}
                      </Link>
                      <Badge variant={post.status === 'PUBLISHED' ? 'success' : 'warning'}>
                        {post.status === 'PUBLISHED' ? t.blog.statusPublished : t.blog.statusDraft}
                      </Badge>
                      {post.featured && <Badge variant="accent">{t.blog.featured}</Badge>}
                    </div>
                    <p className="text-muted truncate text-xs">
                      {[post.category?.name, `/blog/${post.slug}`].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-muted text-xs">
                      {t.blog.lastEdited} {formatDateTime(post.updatedAt)} ·{' '}
                      {authorDisplay(post.author).name}
                      {post.likeCount > 0 ? ` · ♥ ${post.likeCount}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:gap-1">
                    {post.status === 'PUBLISHED' && (
                      <Button asChild size="sm" variant="ghost" className="flex-1 sm:flex-none">
                        <Link href={postPath(post)} target="_blank" title={t.blog.viewOnBlog}>
                          <ExternalLink aria-hidden />
                          <span className="sm:sr-only">{t.blog.viewOnBlog}</span>
                        </Link>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline" className="flex-1 sm:flex-none">
                      <Link href={`/admin/blog/${post.id}`}>
                        <Pencil aria-hidden /> {t.common.edit}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
