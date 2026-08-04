import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { SearchX } from 'lucide-react';
import { getServerT } from '@/lib/i18n/server';

export default async function NotFound() {
  const { t } = await getServerT();
  return (
    <main className="mx-auto flex max-w-md flex-1 items-center px-4 py-16">
      <EmptyState
        icon={SearchX}
        title={t.common.notFound}
        description={t.common.notFoundBody}
        action={
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
        }
        className="w-full"
      />
    </main>
  );
}
