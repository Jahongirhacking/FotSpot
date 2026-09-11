import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { academies, blog } from '@/lib/api/resources';
import type { BlogCategory } from '@/lib/api/types';
import { getSession } from '@/lib/session';
import { isAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { Alert } from '@/components/ui/Feedback';
import { PostEditor } from '../PostEditor';

export const metadata: Metadata = { title: 'New post' };

/** A blank editor. The first save creates the post and moves to its page. */
export default async function NewBlogPostPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/blog/new');
  const { t } = await getServerT();
  if (!isAdminActing(session.activeRole)) {
    return <Alert tone="warning">{t.academy.adminOnly}</Alert>;
  }

  const [categories, academyOptions] = await Promise.all([
    blog
      .categories({ token: session.accessToken, cache: 'no-store' })
      .catch(() => [] as BlogCategory[]),
    academies
      .listPublic(undefined, { token: session.accessToken, cache: 'no-store' })
      .catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        href="/admin/blog"
        className="text-muted hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden /> {t.blog.manage}
      </Link>
      <h1 className="text-xl font-bold">{t.blog.newPost}</h1>
      <PostEditor post={null} categories={categories} images={[]} academyOptions={academyOptions} />
    </div>
  );
}
