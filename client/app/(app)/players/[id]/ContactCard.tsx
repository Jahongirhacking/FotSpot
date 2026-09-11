'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { ContactAccess, PlayerContacts, PlayerDetails } from '@/lib/api/types';
import { formatDate } from '@/lib/utils';
import { CalendarDays, Lock, Mail, MapPin, Phone, Send } from 'lucide-react';
import { SOCIAL_PLATFORMS } from '@/lib/social-links';

/**
 * The exact facts and how to reach the player — drawn only when the API sent
 * them. The card does not decide who may see this; the absence of the data
 * does, so a screen that guessed wrong would simply have nothing to draw.
 *
 * ## Who is sent the contacts
 *
 * The manager of an academy the player is *with* — in its squad, or in one
 * of its open trials. A manager with no such tie is sent `contactAccess:
 * INVITE_TO_UNLOCK` and no contacts, and this card says what would open
 * them: an invitation to a private trial. Everybody else reads the age band
 * on the player's card and no address (README §11, TRIAL.md Rule 28).
 */
export function ContactCard({
  contacts,
  details,
  access = contacts ? 'GRANTED' : null,
}: {
  contacts: PlayerContacts | null;
  details?: PlayerDetails | null;
  access?: ContactAccess;
}) {
  const { t, f } = useI18n();
  const address = [details?.district, details?.region].filter(Boolean).join(', ');
  const social = contacts?.social;
  const rows = [
    contacts?.phone && {
      icon: Phone,
      label: t.player.contactPhone,
      value: contacts.phone,
      href: `tel:${contacts.phone}`,
    },
    // The number the player handed out to be called on: not verified, and
    // not the sign-in phone above it.
    contacts?.contactPhone && {
      icon: Phone,
      label: t.player.contactPhoneGiven,
      value: contacts.contactPhone,
      href: `tel:${contacts.contactPhone}`,
    },
    contacts?.email && {
      icon: Mail,
      label: t.player.contactEmail,
      value: contacts.email,
      href: `mailto:${contacts.email}`,
    },
    contacts?.telegram && {
      icon: Send,
      label: t.player.contactTelegram,
      value: t.player.openInTelegram,
      href: contacts.telegram,
    },
    // The player's own links, with the icon of where each one goes.
    ...SOCIAL_PLATFORMS.map((platform) => {
      const href = social?.[platform.field];
      return (
        href && {
          icon: platform.icon,
          label: platform.label,
          value: href.replace(/^https?:\/\//, ''),
          href,
        }
      );
    }),
  ].filter((row): row is { icon: typeof Phone; label: string; value: string; href: string } =>
    Boolean(row),
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t.player.contacts}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {details && (
          <dl className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <CalendarDays className="text-muted size-4 shrink-0" aria-hidden />
              <dt className="text-muted">{t.player.exactAge}:</dt>
              <dd>
                {f(t.trials.ageYears, { age: details.age })} · {formatDate(details.birthDate)}
              </dd>
            </div>
            {address && (
              <div className="flex items-center gap-2">
                <MapPin className="text-muted size-4 shrink-0" aria-hidden />
                <dt className="text-muted">{t.player.address}:</dt>
                <dd className="truncate">{address}</dd>
              </div>
            )}
          </dl>
        )}

        {access === 'INVITE_TO_UNLOCK' ? (
          /* The rule, in the words of the thing that satisfies it. The button
             itself is the academy panel beside this card. */
          <p className="text-muted flex items-start gap-2 text-sm">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t.player.inviteToSeeContacts}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-muted text-sm">{t.player.noContacts}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center gap-2 text-sm">
                <row.icon className="text-muted size-4 shrink-0" aria-hidden />
                <span className="text-muted">{row.label}:</span>
                <a
                  href={row.href}
                  className="text-primary truncate hover:underline"
                  target={row.href.startsWith('http') ? '_blank' : undefined}
                  rel={row.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                >
                  {row.value}
                </a>
              </li>
            ))}
          </ul>
        )}
        {/* Says who else can see it — nobody — because a manager reading a
            child's phone number should know it is theirs alone to hold. */}
        {access === 'GRANTED' && <p className="text-muted text-xs">{t.player.contactsHint}</p>}
      </CardContent>
    </Card>
  );
}
