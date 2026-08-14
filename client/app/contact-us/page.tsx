import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Clock, Mail, MapPin, Phone } from 'lucide-react';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { Alert } from '@/components/ui/Feedback';
import { getServerT } from '@/lib/i18n/server';
import {
  CONTACT_EMAIL,
  LOCATION,
  PHONES,
  PLACEHOLDER,
  SOCIAL_ACCOUNTS,
  SUPPORT_EMAIL,
  contactCopy,
} from '@/lib/contact';
import { SOCIAL_MARKS } from '@/lib/social-marks';
import { cn } from '@/lib/utils';

/**
 * A top-level route, deliberately outside `(app)` — same reasoning as `/privacy`
 * and `/terms`.
 *
 * That group's layout is the signed-in shell: it renders the header, reads the
 * session and redirects an account that must change its password. None of that
 * belongs around a page whose whole purpose is being readable by somebody who
 * has not signed up and may be deciding whether to.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerT();
  const copy = contactCopy(locale);
  return {
    title: copy.title,
    description: copy.intro,
    // Worth indexing: "how do I contact FotSpot" is a search somebody makes
    // before they trust the platform with their child's name.
    robots: { index: true, follow: true },
  };
}

export default async function ContactUsPage() {
  const { locale, t } = await getServerT();
  const copy = contactCopy(locale);

  const emails = [
    { label: copy.emailGeneral, address: CONTACT_EMAIL },
    { label: copy.emailSupport, address: SUPPORT_EMAIL },
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      {/* The switcher belongs here for the same reason it belongs on the policy
          pages: these are read by people who never saw the app header, and a
          contact page in a language you do not read is not a contact page. */}
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
        <h1 className="text-2xl font-bold sm:text-3xl">{copy.title}</h1>
        <p className="text-muted mt-3 text-sm leading-relaxed">{copy.intro}</p>
      </header>

      {/* Said on the page, not only in a code comment.
          Presenting invented addresses as though somebody answers them is worse
          than admitting they are not live yet — a parent who emails into a void
          trusts the platform less than one who was told to wait. Deleted by
          flipping PLACEHOLDER in lib/contact.ts. */}
      {PLACEHOLDER && (
        <Alert tone="warning" className="mb-8">
          {copy.placeholderNotice}
        </Alert>
      )}

      <div className="space-y-6">
        <Section
          icon={<Mail className="text-primary size-4" aria-hidden />}
          title={copy.emailHeading}
        >
          <ul className="space-y-3">
            {emails.map((entry) => (
              <li key={entry?.address}>
                <p className="text-muted text-xs">{entry?.label}</p>
                <a
                  href={`mailto:${entry?.address}`}
                  className="text-primary font-medium break-all hover:underline"
                >
                  {entry?.address}
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          icon={<Phone className="text-primary size-4" aria-hidden />}
          title={copy.phoneHeading}
        >
          <ul className="space-y-3">
            {PHONES.map((phone) => (
              <li key={phone?.e164}>
                <p className="text-muted text-xs">{copy[phone?.labelKey]}</p>
                {/* href carries E.164 so a tap dials; the screen shows the
                    spaced form, which is the one a person reads back aloud. */}
                <a href={`tel:${phone?.e164}`} className="text-primary font-medium hover:underline">
                  {phone?.display}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-muted mt-3 flex items-center gap-1.5 text-xs">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            {copy.hours}
          </p>
        </Section>

        <Section
          icon={
            <svg
              viewBox="0 0 24 24"
              className="text-primary size-4"
              fill="currentColor"
              aria-hidden
            >
              <path d={SOCIAL_MARKS.telegram?.path} />
            </svg>
          }
          title={copy.socialHeading}
        >
          <p className="text-muted mb-4 text-sm leading-relaxed">{copy.socialIntro}</p>

          <ul className="grid gap-3 sm:grid-cols-2">
            {SOCIAL_ACCOUNTS.map((account) => {
              const mark = SOCIAL_MARKS[account?.network];
              return (
                <li key={account?.network}>
                  <a
                    href={account?.href}
                    target="_blank"
                    // A link off the platform must not keep a handle back to it —
                    // the same rule the trial-note sanitiser enforces.
                    rel="noopener noreferrer"
                    className={cn(
                      'border-border flex items-center gap-3 rounded-lg border p-3 transition-colors',
                      mark?.hover,
                    )}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="size-5 shrink-0"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d={mark?.path} />
                    </svg>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{mark?.label}</span>
                      <span className="block text-xs opacity-80">{account?.handle}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section
          icon={<MapPin className="text-primary size-4" aria-hidden />}
          title={copy.whereHeading}
        >
          <p className="text-sm leading-relaxed">{copy.whereBody}</p>
          <p className="text-muted mt-1 text-xs">
            {LOCATION?.city}, {LOCATION?.country}
          </p>
        </Section>
      </div>

      {/* The policy pages are the other two things a stranger reads before
          signing up, so they are one tap away rather than back via the footer. */}
      <footer className="border-border text-muted mt-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-6 text-xs">
        <Link href="/privacy" className="hover:text-foreground underline underline-offset-2">
          {t.landing?.privacyPolicy}
        </Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="hover:text-foreground underline underline-offset-2">
          {t.landing?.termsOfService}
        </Link>
      </footer>
    </main>
  );
}

/** A titled block, matching the rhythm of the policy pages beside it. */
function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-surface rounded-xl border p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
