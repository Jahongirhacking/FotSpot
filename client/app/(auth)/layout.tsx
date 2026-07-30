import Link from 'next/link';
import { FotSpotMark } from '@/components/shared/FotSpotMark';

/** Route group with no app chrome — a signed-out user has no nav to show. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pitch-gradient flex min-h-dvh flex-col">
      <header className="p-4">
        <Link href="/" className="inline-flex items-center gap-2">
          <FotSpotMark className="size-8" />
          <span className="text-lg font-bold tracking-tight">FotSpot</span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center p-4 pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
