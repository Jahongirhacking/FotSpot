'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Check, ExternalLink, Link2, Pencil, Trash2, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { PlayerProfile, PlayerSocialLinks } from '@/lib/api/types';
import { SOCIAL_PLATFORMS } from '@/lib/social-links';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';

/**
 * The player's own links — Instagram, Telegram, YouTube, Transfermarkt — on
 * their profile, each edited and cleared on its own row.
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
export function SocialLinksCard({ player }: { player: PlayerProfile }) {
  const { t } = useI18n();
  const router = useRouter();
  const [links, setLinks] = React.useState<PlayerSocialLinks>(() => pick(player));
  const [editing, setEditing] = React.useState<keyof PlayerSocialLinks | null>(null);
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // The server is the source of truth after a refresh; keep the row in step.
  const [syncedFrom, setSyncedFrom] = React.useState(player);
  if (player !== syncedFrom) {
    setSyncedFrom(player);
    setLinks(pick(player));
  }

  const save = useMutation({
    mutationFn: (body: { field: keyof PlayerSocialLinks; value: string }) =>
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

  const begin = (field: keyof PlayerSocialLinks) => {
    setEditing(field);
    setDraft(links[field] ?? '');
    setError(null);
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
          {SOCIAL_PLATFORMS.map((platform) => {
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
                        save.mutate({ field: platform.field, value: draft.trim() });
                      }}
                    >
                      <Input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder={platform.hint}
                        aria-label={platform.label}
                        autoFocus
                        maxLength={300}
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

function pick(player: PlayerProfile): PlayerSocialLinks {
  return {
    instagramUrl: player.instagramUrl ?? null,
    telegramUrl: player.telegramUrl ?? null,
    youtubeUrl: player.youtubeUrl ?? null,
    transfermarktUrl: player.transfermarktUrl ?? null,
  };
}
