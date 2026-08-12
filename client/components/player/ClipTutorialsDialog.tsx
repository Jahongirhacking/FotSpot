'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import type { MediaCategory } from '@/lib/api/types';
import { tutorialFor } from '@/lib/clip-tutorials';
import { ATTRIBUTE_CATEGORY, ATTRIBUTE_KEYS } from '@/lib/player-card';
import { cn } from '@/lib/utils';
import { GraduationCap, Trophy } from 'lucide-react';
import * as React from 'react';

/**
 * "Watch tutorials" — one short vertical clip per skill, with the written tips
 * beside it.
 *
 * ## One video at a time, deliberately
 *
 * A grid of seven autoplaying 9:16 videos is seven decodes and seven downloads
 * on a phone that is about to be asked to upload a minute of its own footage
 * (§14). So this shows a strip of skills, and only the selected one is mounted —
 * the rest are names until they are chosen.
 *
 * ## The same words as the uploader
 *
 * The text under each video is `t.clipTips`, which is exactly what
 * `ClipUploader` shows once that category is picked. Two descriptions of the
 * same skill would drift, and the tutorial is meant to *illustrate* the
 * instruction rather than compete with it.
 */
export function ClipTutorialsDialog({ trigger }: { trigger: React.ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState<MediaCategory>('PACE');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="text-primary size-5" aria-hidden />
            {t.clips.watchTutorials}
          </DialogTitle>
          <DialogDescription>{t.clips.tutorialsHint}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* The skill strip: the same set and order as the uploader's chips, so
              the two screens are recognisably one flow. */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {ATTRIBUTE_KEYS.map((key) => (
              <SkillChip
                key={key}
                active={category === ATTRIBUTE_CATEGORY?.[key]}
                label={t.attributes[key]}
                onClick={() => setCategory(ATTRIBUTE_CATEGORY?.[key])}
              />
            ))}
            <SkillChip
              active={category === 'MATCH_HIGHLIGHTS'}
              icon={Trophy}
              label={t.attributes.highlights}
              onClick={() => setCategory('MATCH_HIGHLIGHTS')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
            <TutorialPlayer category={category} />

            <div className="space-y-3">
              <TutorialCopy category={category} />
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The 9:16 frame.
 *
 * `key` is the category, so switching skill remounts the element rather than
 * swapping `src` on a playing video — which leaves the old frame visible while
 * the new one buffers. Nothing autoplays: the player presses when ready, which
 * also keeps a phone from spending data the moment the dialog opens.
 */
function TutorialPlayer({ category }: { category: MediaCategory }) {
  const { t } = useI18n();
  const tutorial = tutorialFor(category);

  /*
   * Which skills have no playable file, rather than a boolean reset per switch.
   *
   * A single `failed` flag needed clearing every time the category changed,
   * which is a setState in an effect and one render of the wrong answer. A set
   * of the ones already known to be missing needs no reset: it only ever grows,
   * and the lookup is correct on the first paint after a switch.
   */
  const [missing, setMissing] = React.useState<ReadonlySet<string>>(new Set());
  const failed = missing.has(category);

  if (!tutorial?.src || failed) {
    return (
      <div className="bg-surface-2 border-border text-muted grid aspect-[9/16] w-full place-items-center rounded-xl border p-4 text-center text-xs">
        {t.clips.tutorialUnavailable}
      </div>
    );
  }

  return (
    <video
      key={category}
      src={tutorial?.src}
      poster={tutorial?.poster}
      controls
      playsInline
      preload="none"
      onError={() => setMissing((current) => new Set(current).add(category))}
      className="bg-surface-3 aspect-[9/16] w-full rounded-xl object-cover"
    />
  );
}

/** The written instruction for this skill — the uploader's own copy. */
function TutorialCopy({ category }: { category: MediaCategory }) {
  const { t } = useI18n();
  const tips = t.clipTips?.[category as keyof typeof t.clipTips];

  if (!tips || typeof tips === 'string') return null;

  return (
    <>
      <div className="space-y-2">
        <p className="text-sm leading-snug">
          <span className="font-semibold">{t.clipTips.playerLabel}:</span>{' '}
          <span className="text-muted">{tips?.player}</span>
        </p>
        <p className="text-sm leading-snug">
          <span className="font-semibold">{t.clipTips.goalkeeperLabel}:</span>{' '}
          <span className="text-muted">{tips?.goalkeeper}</span>
        </p>
      </div>
      <p className="text-muted border-border border-t pt-3 text-xs leading-snug">
        {t.clipTips.camera}
      </p>
    </>
  );
}

function SkillChip({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border hover:border-primary/50',
      )}
    >
      {Icon && <Icon className="size-3" aria-hidden />}
      {label}
    </button>
  );
}
