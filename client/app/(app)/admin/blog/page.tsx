import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Newspaper, Plus } from 'lucide-react';
import { blog } from '@/lib/api/resources';
import type { BlogCategory, BlogPostCard, BlogPostStatus } from '@/lib/api/types';
import type { Page } from '@/lib/api/client';
import { getSession } from '@/lib/session';
import { isAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { Alert } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/shared/Pagination';
import { AdminPostList } from './AdminPostList';
import { CategoryManager } from './CategoryManager';

export const metadata: Metadata = { title: 'Blog' };

const PAGE_SIZE = 20;

/**
 * The blog's desk — admin and super admin.
 *
 * Every post at every status, filtered by status and search, with the
 * categories beside them. The role is checked before the fetch, not around
 * the render; the API refuses anybody else regardless (`@Roles`), so this
 * is the courtesy, not the rule.
 *
 * NOTE (Next 16): `searchParams` is a Promise.
 */
export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/blog');
  const { t } = await getServerT();
  if (!isAdminActing(session.activeRole)) {
    return <Alert tone="warning">{t.academy.adminOnly}</Alert>;
  }

  const params = await searchParams;
  const status =
    params?.status === 'DRAFT' || params?.status === 'PUBLISHED'
      ? (params.status as BlogPostStatus)
      : undefined;
  const q = params?.q?.trim() || undefined;
  const page = Number(params?.page ?? 1) || 1;

  const opts = {
    token: session.accessToken,
    activeRole: session.activeRole,
    cache: 'no-store' as const,
  };
  const empty: Page<BlogPostCard & { status: BlogPostStatus; createdAt: string }> = {
    items: [],
    total: 0,
    page,
    pageSize: PAGE_SIZE,
  };
  const [list, categories] = await Promise.all([
    blog.adminList({ status, q, page, pageSize: PAGE_SIZE }, opts).catch(() => empty),
    blog.categories(opts).catch(() => [] as BlogCategory[]),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Newspaper className="text-primary size-5" aria-hidden /> {t.blog.manage}
          </h1>
          <p className="text-muted text-sm">{t.blog.manageHint}</p>
        </div>
        <Button asChild>
          <Link href="/admin/blog/new">
            <Plus aria-hidden /> {t.blog.newPost}
          </Link>
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-4">
          <AdminPostList items={list.items} total={list.total} status={status} q={q} />
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} />
        </section>
        <aside>
          <CategoryManager initial={categories} />
        </aside>
      </div>
    </div>
  );
}
