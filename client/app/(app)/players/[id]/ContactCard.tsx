'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { PlayerContacts, PlayerDetails } from '@/lib/api/types';
import { formatDate } from '@/lib/utils';
import { CalendarDays, Mail, MapPin, Phone, Send } from 'lucide-react';

/**
 * The exact facts and how to reach the player — drawn only when the API sent
 * them, which it does for an academy's manager and for nobody else. The card
 * does not decide who may see this; the absence of the data does, so a screen
 * that guessed wrong would simply have nothing to draw.
 *
 * Everybody else reads the age band on the player's card and no address
 * (README §11, TRIAL.md Rule 28).
 */
export function ContactCard({
  contacts,
  details,
}: {
  contacts: PlayerContacts;
  details?: PlayerDetails | null;
}) {
  const { t, f } = useI18n();
  const address = [details?.district, details?.region].filter(Boolean).join(', ');
  const rows = [
    contacts?.phone && {
      icon: Phone,
      label: t.player.contactPhone,
      value: contacts.phone,
      href: `tel:${contacts.phone}`,
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

        {rows.length === 0 ? (
          <p className="text-muted text-sm">{t.player.noContacts}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center gap-2 text-sm">
                <row.icon className="text-muted size-4 shrink-0" aria-hidden />
                <span className="text-muted">{row.label}:</span>
                <a href={row.href} className="text-primary truncate hover:underline">
                  {row.value}
                </a>
              </li>
            ))}
          </ul>
        )}
        {/* Says who else can see it — nobody — because a manager reading a
            child's phone number should know it is theirs alone to hold. */}
        <p className="text-muted text-xs">{t.player.contactsHint}</p>
      </CardContent>
    </Card>
  );
}
