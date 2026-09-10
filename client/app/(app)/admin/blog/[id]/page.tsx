import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { blog } from '@/lib/api/resources';
import type { BlogCategory } from '@/lib/api/types';
import { getSession } from '@/lib/session';
import { isAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { Alert } from '@/components/ui/Feedback';
import { PostEditor } from '../PostEditor';

export const metadata: Metadata = { title: 'Edit post' };

/**
 * The editor on an existing post. `no-store`, because an editor who just
 * saved must see what they saved. NOTE (Next 16): `params` is a Promise.
 */
export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/admin/blog/${id}`);
  const { t } = await getServerT();
  if (!isAdminActing(session.activeRole)) {
    return <Alert tone="warning">{t.academy.adminOnly}</Alert>;
  }

  const opts = {
    token: session.accessToken,
    activeRole: session.activeRole,
    cache: 'no-store' as const,
  };
  let post;
  try {
    post = await blog.adminGet(id, opts);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const categories = await blog.categories(opts).catch(() => [] as BlogCategory[]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        href="/admin/blog"
        className="text-muted hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden /> {t.blog.manage}
      </Link>
      <h1 className="text-xl font-bold">{t.blog.editPost}</h1>
      {/* Keyed on the post so a save that changed the row remounts the form
          with the row as saved. */}
      <PostEditor key={post.updatedAt} post={post} categories={categories} />
    </div>
  );
}
