import { SupportFooter } from '@/components/auth/SupportFooter';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { FotSpotMark } from '@/components/shared/FotSpotMark';
import Link from 'next/link';

/** Route group with no app chrome — a signed-out user has no nav to show. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pitch-gradient flex min-h-dvh flex-col">
      <header className="flex items-center justify-between p-4">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 pr-1">
          <FotSpotMark className="size-11" />
          <span className="text-lg font-bold tracking-tight">FotSpot</span>
        </Link>
        {/* Grouped: as three direct children of a `justify-between` row, the theme
            toggle was pushed into the middle of the header on its own. Signed-out
            users need the language picker most — you can't ask someone to register
            in a language they don't read. */}
        <div className="flex items-center gap-1">
          <ThemeToggle compact />
          <LanguageSwitcher />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-4 pb-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
      {/* Who to ask when the form above is the problem — the same on every
          screen in this group, so neither page repeats it. */}
      <SupportFooter />
    </div>
  );
}
