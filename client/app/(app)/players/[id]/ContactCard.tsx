'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { PlayerContacts } from '@/lib/api/types';
import { Mail, Phone, Send } from 'lucide-react';

/**
 * How to reach the player — drawn only when the API sent contacts, which it
 * does for an academy's manager and for nobody else. The card does not decide
 * who may see this; the absence of the data does, so a screen that guessed
 * wrong would simply have nothing to draw.
 */
export function ContactCard({ contacts }: { contacts: PlayerContacts }) {
  const { t } = useI18n();
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
      <CardContent className="space-y-2">
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
