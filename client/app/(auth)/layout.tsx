import Link from 'next/link';
import { FotSpotMark } from '@/components/shared/FotSpotMark';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';

/** Route group with no app chrome — a signed-out user has no nav to show. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pitch-gradient flex min-h-dvh flex-col">
      <header className="flex items-center justify-between p-4">
        <Link href="/" className="inline-flex items-center gap-2">
          <FotSpotMark className="size-8" />
          <span className="text-lg font-bold tracking-tight">FotSpot</span>
        </Link>
        {/* Signed-out users need this most: you can't ask someone to register in a
            language they don't read. */}
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center p-4 pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
