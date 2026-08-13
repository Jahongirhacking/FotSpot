import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getServerT } from '@/lib/i18n/server';
import { PRIVACY_LAST_UPDATED, privacyPolicy } from '@/lib/legal/privacy';
import { formatDate } from '@/lib/utils';

/**
 * A top-level route, deliberately outside `(app)`.
 *
 * That group's layout is the signed-in shell: it renders the header, reads the
 * session and redirects an account that must change its password. None of that
 * belongs around a document a stranger reads before deciding whether to let their
 * child sign up — and putting it there is also what would have put a link to it
 * in the navigation.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerT();
  const policy = privacyPolicy(locale);
  return {
    title: policy.title,
    description: policy.intro[0],
    // Worth indexing: somebody deciding whether to trust the platform may well
    // arrive here from a search rather than from the footer.
    robots: { index: true, follow: true },
  };
}

export default async function PrivacyPage() {
  const { locale, t } = await getServerT();
  const policy = privacyPolicy(locale);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <Link
        href="/"
        className="text-muted hover:text-foreground mb-8 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t.common?.back}
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl font-bold sm:text-3xl">{policy.title}</h1>
        <p className="text-muted mt-2 text-xs">
          {policy.lastUpdatedLabel}: {formatDate(PRIVACY_LAST_UPDATED)}
        </p>
      </header>

      <div className="space-y-4">
        {policy.intro.map((paragraph) => (
          <p key={paragraph} className="text-sm leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>

      {/* Sections rather than one wall of prose: this is a document people scan
          for the one answer they came for, not one they read start to finish. */}
      <div className="mt-10 space-y-9">
        {policy.sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="border-border border-b pb-2 text-base font-semibold sm:text-lg">
              {section.heading}
            </h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="text-muted text-sm leading-relaxed">
                {paragraph}
              </p>
            ))}
            {section.items && (
              <ul className="text-muted list-disc space-y-2 pl-5 text-sm leading-relaxed">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <footer className="text-muted border-border mt-12 border-t pt-6 text-center text-xs">
        FotSpot · Bulalar Team
      </footer>
    </main>
  );
}
