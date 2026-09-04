import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { DeleteAccountDialog } from '@/components/legal/DeleteAccountDialog';
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
  return pageMetadata({ path: '/privacy', title: policy.title, description: policy.intro[0] });
}

export default async function PrivacyPage() {
  const { locale, t } = await getServerT();
  const policy = privacyPolicy(locale);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      {/* The switcher belongs on these pages specifically: they are read by
          people who are not signed in and therefore never saw the app header,
          and a policy in a language you do not read is not a policy. */}
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="text-muted hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t.common?.back}
        </Link>
        <LanguageSwitcher />
      </div>

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

      {/* Where somebody who has just read "you can ask us to delete this" acts
          on it. On the policy page only: the terms are the rules of use, and a
          destructive action does not belong under them. */}
      <section className="border-border bg-surface-2/40 mt-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <p className="text-muted min-w-0 text-sm">{t.requests?.askDeleteBody}</p>
        <DeleteAccountDialog />
      </section>

      <footer className="text-muted border-border mt-12 border-t pt-6 text-center text-xs">
        FotSpot · Bulalar Team
      </footer>
    </main>
  );
}
