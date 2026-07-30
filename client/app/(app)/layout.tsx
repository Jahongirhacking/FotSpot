import { AppHeader } from '@/components/layout/AppHeader';

/**
 * Authenticated shell. `proxy.ts` has already redirected unauthenticated traffic,
 * so this can assume a session without re-checking.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="text-muted border-border mt-auto border-t px-4 py-6 text-center text-xs">
        FotSpot · Grassroots → Academy → Professional
      </footer>
    </>
  );
}
