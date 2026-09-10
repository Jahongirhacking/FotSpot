import Link from 'next/link';
import { Newspaper } from 'lucide-react';
import { getServerT } from '@/lib/i18n/server';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';

/** A draft, a deleted post, or a mistyped address — all the same answer. */
export default async function BlogPostNotFound() {
  const { t } = await getServerT();
  return (
    <EmptyState
      icon={Newspaper}
      title={t.blog.postNotFound}
      description={t.blog.postNotFoundHint}
      action={
        <Button asChild variant="outline">
          <Link href="/blog">{t.blog.title}</Link>
        </Button>
      }
    />
  );
}
