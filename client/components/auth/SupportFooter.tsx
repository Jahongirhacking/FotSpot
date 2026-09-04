import { Mail, Send } from 'lucide-react';
import { CONTACT_EMAIL, SUPPORT_BOT } from '@/lib/contact';
import { getServerT } from '@/lib/i18n/server';

/**
 * How to reach a person when the form in front of you is not working.
 *
 * Mounted once, in the auth layout, so the sign-in and register screens
 * carry the same two lines without either page knowing about them. A server
 * component: there is nothing to hydrate — two links and a heading.
 *
 * The Telegram link is a bot deep link with `?text=`, which opens the bot with
 * the message already in the compose field rather than merely opening the
 * chat, so the reader presses send and nothing else. The sentence is the
 * reader's own language, and it is URL-encoded here — an apostrophe or a
 * space left raw would reach the bot as a broken link on some clients. The
 * same bot and address the contact page lists: one place for each, in
 * lib/contact.
 */
export async function SupportFooter() {
  const { t } = await getServerT();
  const telegram = `${SUPPORT_BOT}?text=${encodeURIComponent(t.auth.supportMessage)}`;
  const handle = `@${SUPPORT_BOT.replace(/^https?:\/\/t\.me\//, '')}`;

  const link =
    'hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors focus-visible:ring-2 focus-visible:outline-none';

  return (
    <footer className="text-muted mx-auto w-full max-w-md px-4 pb-8 text-sm">
      <div className="border-border border-t pt-5">
        <p className="text-foreground mb-1 text-center text-sm font-medium">
          {t.auth.supportTitle}
        </p>
        <ul className="flex flex-col items-center gap-x-6 gap-y-0 sm:flex-row sm:justify-center">
          <li>
            <a href={telegram} target="_blank" rel="noopener noreferrer" className={link}>
              <Send className="text-primary size-4 shrink-0" aria-hidden />
              <span>
                <span className="sr-only sm:not-sr-only sm:mr-1.5">Telegram</span>
                <span className="text-foreground font-medium">{handle}</span>
              </span>
            </a>
          </li>
          <li>
            <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
              <Mail className="text-primary size-4 shrink-0" aria-hidden />
              <span>
                <span className="sr-only sm:not-sr-only sm:mr-1.5">Email</span>
                <span className="text-foreground font-medium">{CONTACT_EMAIL}</span>
              </span>
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
