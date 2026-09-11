'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Check, ExternalLink, Link2, Pencil, Phone, Trash2, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { PlayerProfile, PlayerSocialLinks } from '@/lib/api/types';
import { SOCIAL_PLATFORMS } from '@/lib/social-links';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';

/**
 * The player's own contact rows — a phone number to be called on, then
 * Instagram, Telegram, YouTube, Transfermarkt — on their profile, each edited
 * and cleared on its own row.
 *
 * ## The phone is not the sign-in phone
 *
 * It is a number the player hands out for an academy manager to call, kept
 * like a link: unverified, private, theirs to add and remove. The only rule
 * is the shape — `+` and the country code first — checked here before the
 * request and again by the API, so what a manager taps actually dials.
 *
 * ## One row, one link
 *
 * A form of four boxes and one Save asks the player to get all four right at
 * once; a row that edits one link and saves it alone matches how they arrive
 * — pasted from a phone, one at a time. Saving sends only that field, and an
 * empty value clears it; the API checks the host so the icon beside a link is
 * never a lie about where it goes.
 *
 * ## Who reads them
 *
 * Nobody, by default. The links are private like a phone number and are
 * shown to the manager of an academy the player is in a squad or an open
 * trial with (README §11) — said here, under the card, so a fifteen-year-old
 * knows who is on the other side of what they paste.
 */
type ContactField = keyof PlayerSocialLinks | 'contactPhone';
type ContactValues = Record<ContactField, string | null>;

/** `+`, a country code, then digits — E.164, what a phone can dial. */
const E164 = /^\+[1-9]\d{6,14}$/;

export function SocialLinksCard({ player }: { player: PlayerProfile }) {
  const { t } = useI18n();
  const router = useRouter();
  const [links, setLinks] = React.useState<ContactValues>(() => pick(player));
  const [editing, setEditing] = React.useState<ContactField | null>(null);
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const rows: readonly {
    field: ContactField;
    kind: 'phone' | 'url';
    label: string;
    hint: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      field: 'contactPhone',
      kind: 'phone',
      label: t.profile.contactPhone,
      hint: '+998 90 123 45 67',
      icon: Phone,
    },
    ...SOCIAL_PLATFORMS.map((platform) => ({ ...platform, kind: 'url' as const })),
  ];

  // The server is the source of truth after a refresh; keep the row in step.
  const [syncedFrom, setSyncedFrom] = React.useState(player);
  if (player !== syncedFrom) {
    setSyncedFrom(player);
    setLinks(pick(player));
  }

  const save = useMutation({
    mutationFn: (body: { field: ContactField; value: string }) =>
      browserFetch<PlayerProfile>('/players/me', {
        method: 'PATCH',
        body: { [body.field]: body.value },
      }),
    onSuccess: (updated, body) => {
      setLinks((current) => ({ ...current, [body.field]: updated[body.field] ?? null }));
      setEditing(null);
      setDraft('');
      setError(null);
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
    meta: { success: t.profile.socialSaved },
  });

  const begin = (field: ContactField) => {
    setEditing(field);
    setDraft(links[field] ?? '');
    setError(null);
  };

  /** The same shape the API demands, checked before the round trip. */
  const submit = (field: ContactField, kind: 'phone' | 'url', raw: string) => {
    if (kind === 'phone') {
      const compact = raw.replace(/[\s().-]/g, '');
      if (compact !== '' && !E164.test(compact)) {
        setError(t.profile.contactPhoneInvalid);
        return;
      }
      save.mutate({ field, value: compact });
      return;
    }
    save.mutate({ field, value: raw.trim() });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="text-primary size-4" aria-hidden /> {t.profile.socialLinks}
        </CardTitle>
        <CardDescription>{t.profile.socialLinksHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <Alert tone="danger">{error}</Alert>}

        <ul className="divide-border divide-y">
          {rows.map((platform) => {
            const Icon = platform.icon;
            const value = links[platform.field];
            const isEditing = editing === platform.field;
            const busy = save.isPending && save.variables?.field === platform.field;
            return (
              <li
                key={platform.field}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
              >
                <span className="bg-surface-2 grid size-9 shrink-0 place-items-center rounded-lg">
                  <Icon className="text-primary size-4" aria-hidden />
                </span>

                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-sm font-medium">{platform.label}</p>
                  {isEditing ? (
                    <form
                      className="mt-1 flex items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        submit(platform.field, platform.kind, draft);
                      }}
                    >
                      <Input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder={platform.hint}
                        aria-label={platform.label}
                        autoFocus
                        maxLength={platform.kind === 'phone' ? 40 : 300}
                        inputMode={platform.kind === 'phone' ? 'tel' : undefined}
                        type={platform.kind === 'phone' ? 'tel' : undefined}
                        className="min-w-0 flex-1"
                      />
                      <Button size="sm" type="submit" loading={busy}>
                        <Check aria-hidden /> {t.common.save}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        aria-label={t.common.cancel}
                        onClick={() => {
                          setEditing(null);
                          setError(null);
                        }}
                      >
                        <X aria-hidden />
                      </Button>
                    </form>
                  ) : value && platform.kind === 'phone' ? (
                    <p className="text-xs">
                      <a href={`tel:${value}`} className="text-primary hover:underline">
                        {value}
                      </a>
                      <span className="text-muted"> · {t.profile.contactPhoneHint}</span>
                    </p>
                  ) : value ? (
                    <a
                      href={value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary flex min-w-0 items-center gap-1 text-xs hover:underline"
                    >
                      <span className="truncate">{value.replace(/^https?:\/\//, '')}</span>
                      <ExternalLink className="size-3 shrink-0" aria-hidden />
                    </a>
                  ) : (
                    <p className="text-muted text-xs">{t.profile.socialNotSet}</p>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => begin(platform.field)}
                      disabled={save.isPending}
                    >
                      <Pencil aria-hidden /> {value ? t.common.edit : t.profile.socialAdd}
                    </Button>
                    {value && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t.profile.socialRemove}
                        title={t.profile.socialRemove}
                        loading={busy}
                        onClick={() => save.mutate({ field: platform.field, value: '' })}
                      >
                        <Trash2 className="text-danger" aria-hidden />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="text-muted text-xs">{t.profile.socialPrivacy}</p>
      </CardContent>
    </Card>
  );
}

function pick(player: PlayerProfile): ContactValues {
  return {
    contactPhone: player.contactPhone ?? null,
    instagramUrl: player.instagramUrl ?? null,
    telegramUrl: player.telegramUrl ?? null,
    youtubeUrl: player.youtubeUrl ?? null,
    transfermarktUrl: player.transfermarktUrl ?? null,
  };
}
