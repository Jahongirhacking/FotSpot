import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 items-center px-4 py-16">
      <EmptyState
        icon={SearchX}
        title="Page not found"
        description="That link may be old, or the profile may have been removed."
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
