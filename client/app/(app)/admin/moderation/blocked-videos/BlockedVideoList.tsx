'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ShieldOff, Trash2, TriangleAlert } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { PendingClip } from '@/lib/api/types';
import { CATEGORY_ATTRIBUTE } from '@/lib/player-card';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { ageBand, formatDate, initials } from '@/lib/utils';

/**
 * What the platform has taken down, and the one action left on it.
 *
 * ## Why blocked clips get a screen of their own
 *
 * Blocking keeps the row and the video deliberately — "what did we take down,
 * and when" is a question a moderation decision has to answer months later. But
 * kept footage nobody can reach is still footage of a child sitting in a bucket,
 * and only a super admin may end that (§1.2). Without this list, the delete they
 * alone can perform was reachable only from the pending queue, which by
 * definition no longer holds any of it.
 *
 * ## Read-mostly, so the server renders it
 *
 * Unlike the pending queue this is not worked at speed — it is consulted, and
 * occasionally acted on. Paging is URL-driven and server-rendered
 * (client/CLAUDE.md §8), so a page of it is shareable and survives the back
 * button; only the delete needs a client island, which is this component.
 */
export function BlockedVideoList({ clips }: { clips: PendingClip[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<PendingClip | null>(null);

  const destroy = useMutation({
    mutationFn: (id: string) => browserFetch(`/moderation/media/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeleting(null);
      setError(null);
      // The list is server-rendered, so the server is what has to say it is gone.
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  if (clips.length === 0) {
    return (
      <EmptyState
        icon={ShieldOff}
        title={t.admin.noBlockedVideos}
        description={t.admin.noBlockedVideosHint}
      />
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}

      {clips.map((clip) => (
        <BlockedCard
          key={clip.id}
          clip={clip}
          busy={destroy.isPending}
          onDelete={() => setDeleting(clip)}
        />
      ))}

      <DeleteClipDialog
        clip={deleting}
        busy={destroy.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={(id) => destroy.mutate(id)}
      />
    </div>
  );
}

/**
 * One blocked clip.
 *
 * The video is `preload="none"`, unlike the pending queue's `metadata`: nobody is
 * reviewing this list top-to-bottom, so a page of blocked clips should cost the
 * poster frames and nothing else until one is actually opened.
 */
function BlockedCard({
  clip,
  busy,
  onDelete,
}: {
  clip: PendingClip;
  busy: boolean;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const attribute = CATEGORY_ATTRIBUTE[clip.category];
  const label =
    clip.category === 'MATCH_HIGHLIGHTS'
      ? t.attributes.highlights
      : attribute
        ? t.attributes[attribute]
        : clip.category;

  const name = [clip.player.firstName, clip.player.lastName].filter(Boolean).join(' ');

  return (
    <Card className="border-danger/30">
      <CardContent className="space-y-3 p-4">
        <header className="flex flex-wrap items-center gap-3">
          <Link
            href={`/players/${clip.player.id}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <Avatar
              src={clip.player.avatarUrl}
              fallback={initials(clip.player.firstName, clip.player.lastName)}
              className="size-9"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="text-muted block truncate text-xs">
                {[clip.player.primaryPosition, ageBand(clip.player.birthDate), clip.player.region]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          </Link>

          <Badge variant="danger">
            <ShieldOff aria-hidden /> {t.clips.moderationBlocked}
          </Badge>
          <Badge variant="neutral">{label}</Badge>
        </header>

        {clip.url ? (
          <video
            src={clip.url}
            poster={clip.posterUrl ?? undefined}
            controls
            playsInline
            preload="none"
            className="max-h-[60dvh] w-full rounded-lg bg-black"
          />
        ) : (
          <div className="bg-surface-3 text-muted grid aspect-video w-full place-items-center rounded-lg">
            <span className="flex flex-col items-center gap-1.5 px-4 text-center">
              <TriangleAlert className="size-5" aria-hidden />
              <span className="text-sm">{t.clips.noStorageOrigin}</span>
            </span>
          </div>
        )}

        {clip.title && <p className="text-sm font-medium">{clip.title}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted text-xs">
            {t.admin.uploadedAt}: {formatDate(clip.createdAt)}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger ml-auto"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 aria-hidden /> {t.admin.deleteClip}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The destructive confirmation, matching the one in the pending queue.
 *
 * Typing the word is friction chosen on purpose: this is the only action here
 * that no later decision can undo, and a super admin working down a list of
 * takedowns should not be able to erase a player's video with a reflex.
 */
function DeleteClipDialog({
  clip,
  busy,
  onCancel,
  onConfirm,
}: {
  clip: PendingClip | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (id: string) => void;
}) {
  const { t } = useI18n();
  const [typed, setTyped] = React.useState('');

  // Both sides normalised to `string | null` before comparing — testing an
  // undefined id against a value coerced to null never settles, and the reset
  // then runs on every render until React aborts the tree.
  const clipId = clip?.id ?? null;
  const [lastClipId, setLastClipId] = React.useState<string | null>(clipId);
  if (clipId !== lastClipId) {
    setLastClipId(clipId);
    setTyped('');
  }

  const word = t.admin.deleteClipWord;
  const confirmed = typed.trim().toLocaleUpperCase() === word.toLocaleUpperCase();

  return (
    <Dialog open={Boolean(clip)} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-danger flex items-center gap-2">
            <Trash2 className="size-5" aria-hidden /> {t.admin.deleteClipTitle}
          </DialogTitle>
          <DialogDescription>{t.admin.deleteClipBody}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Alert tone="danger">{t.admin.deleteClipBody}</Alert>
          <Field
            className="mt-3"
            label={t.admin.deleteClipConfirm.replace('{word}', word)}
            htmlFor="delete-blocked-confirm"
            required
          >
            <Input
              id="delete-blocked-confirm"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!confirmed}
            onClick={() => clip && onConfirm(clip.id)}
          >
            <Trash2 aria-hidden /> {t.admin.deleteClip}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
