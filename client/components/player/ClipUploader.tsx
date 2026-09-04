'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { browserFetch } from '@/lib/api/browser';
import type { ClipQuota } from '@/lib/api/resources';
import type { Media, MediaCategory } from '@/lib/api/types';
import { uploadToStorage } from '@/lib/api/upload';
import { ATTRIBUTE_CATEGORY, ATTRIBUTE_KEYS } from '@/lib/player-card';
import { capturePoster } from '@/lib/poster';
import { cn, formatDate } from '@/lib/utils';
import { isAfterToday, todayInputValue } from '@/lib/recorded-date';
import { compressForFeed, MAX_DURATION_SECONDS, mustProcess } from '@/lib/video/compress';
import type { CompressResult } from '@/lib/video/compress.types';
import {
  countCameras,
  offersSwitch,
  openCamera,
  switchCamera,
  type Facing,
} from '@/lib/video/camera';
import { formatTimer, previewFit } from '@/lib/video/recorder-ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Disc, Scissors, SwitchCamera, Trophy, Upload, Wand2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { createPortal } from 'react-dom';

/**
 * §21.6 — a clip is a proof, not a highlight reel. One minute is the cap.
 *
 * The recorder stops at it; a longer file picked from the gallery is trimmed to
 * it rather than refused (see `compressForFeed`). One constant for both, so the
 * two halves of the same rule cannot drift apart.
 */
const MAX_SECONDS = MAX_DURATION_SECONDS;
const MAX_BYTES = 120 * 1024 * 1024;

type Category = MediaCategory;

/**
 * Uploads a clip and the attribute claim it evidences.
 *
 * ## The skill is chosen first, and that is the whole shape of this screen
 *
 * It used to ask for the video first and the skill afterwards, which put the one
 * question that changes *what you should film* after the filming was done. A
 * player recorded something, then read that Pace wants a 20–30 m run from a
 * standing start, and their clip was the wrong clip — under the plan limits, a
 * wasted upload for the week and a minute of mobile data they had already paid
 * for.
 *
 * So the order is: pick the skill, read what it wants, film that, score it, name
 * it. Each step appears once the one above it is answered, so the panel is never
 * a wall of controls and never asks for something it has not yet explained.
 *
 * ## Why the rating is part of the upload, not a separate field
 *
 * A number on its own is a rumour. Requiring the claim and its evidence in one
 * step means every self-reported bar on the card has a video a scout can open and
 * disagree with — which is what makes a self-rating worth showing at all, and why
 * the category is mandatory while the title and description are not.
 *
 * The rating stays self-reported however convincing the video is (§1.6). The bar
 * renders dashed until a coach signs it off; this raises the claim, not its
 * standing.
 */
export function ClipUploader({
  onUploaded,
  onRecorderOpenChange,
}: {
  onUploaded: (media: Media) => void;
  onCancel: () => void;
  /**
   * Raised while the full-screen camera is open.
   *
   * The dialog containing this uploader has to know, because the camera is
   * portalled out of it — see `RecorderOverlay`. Optional so a caller that does
   * not host it in a dialog need not care.
   */
  onRecorderOpenChange?: (open: boolean) => void;
}) {
  const { t, f } = useI18n();
  const router = useRouter();

  const [file, setFile] = React.useState<File | null>(null);
  /*
   * The optimised copy, produced while the player fills in the rest of the form.
   *
   * Started the moment a file is chosen rather than on submit, so the encode runs
   * during the seconds they spend on the rating and the title — by the time they
   * press upload it is usually already done, and the wait costs nothing. Pressing
   * upload early simply waits for it.
   */
  const [optimised, setOptimised] = React.useState<{
    status: 'idle' | 'running' | 'done';
    progress: number;
    result: CompressResult | null;
  }>({ status: 'idle', progress: 0, result: null });
  const compressionRef = React.useRef<AbortController | null>(null);
  const [category, setCategory] = React.useState<Category | null>(null);
  const [rating, setRating] = React.useState(50);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  /*
   * When the clip was filmed. On by default — most clips are uploaded the day
   * they are shot, and a date nobody had to pick is a date nobody gets wrong.
   * Off shows a date input capped at today; the API caps it again.
   */
  const [autoDate, setAutoDate] = React.useState(true);
  const [recordedOn, setRecordedOn] = React.useState(() => todayInputValue());
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  // Asked before recording rather than after: discovering the server cannot
  // store video *after* filming a minute of it is the worst possible moment.
  const { data: storage } = useQuery({
    queryKey: ['media-storage-status'],
    queryFn: () =>
      browserFetch<{ configured: boolean; quota: ClipQuota | null }>('/media/storage-status'),
    staleTime: 5 * 60 * 1000,
  });

  // Derived, not stored: an effect that sets state would render one frame with
  // the previous file's URL. The effect exists only to revoke — leaking blob
  // URLs on a phone holds the whole video in memory until the tab closes.
  const previewUrl = React.useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  React.useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const accept = (candidate: File) => {
    setError(null);
    if (!candidate.type.startsWith('video/')) return setError(t.clips.videoOnly);
    if (candidate.size > MAX_BYTES) return setError(t.clips.tooLarge);
    setFile(candidate);
    startCompression(candidate);
  };

  /**
   * Re-encodes in the background.
   *
   * Never rejects and never blocks: `compressForFeed` returns the original file
   * on every failure path, so the worst case here is the upload that would have
   * happened anyway. A second file replacing the first cancels the first encode —
   * two hardware encoder sessions on a phone is how a low-end device runs out of
   * memory.
   */
  const startCompression = (candidate: File) => {
    compressionRef.current?.abort();
    const controller = new AbortController();
    compressionRef.current = controller;

    setOptimised({ status: 'running', progress: 0, result: null });

    void compressForFeed(candidate, {
      signal: controller.signal,
      onProgress: (fraction) => {
        if (controller.signal.aborted) return;
        setOptimised((was) => (was.status === 'running' ? { ...was, progress: fraction } : was));
      },
    }).then((result) => {
      if (controller.signal.aborted) return;
      setOptimised({ status: 'done', progress: 1, result });
    });
  };

  // A camera left encoding after the dialog closes is a battery drain on a
  // minor's phone, the same reasoning as LiveRecorder's cleanup.
  React.useEffect(() => () => compressionRef.current?.abort(), []);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !category) throw new Error(t.clips.pickCategory);
      if (!autoDate && isAfterToday(recordedOn)) throw new Error(t.clips.recordedInFuture);

      /*
       * The optimised copy if there is one, the original otherwise.
       *
       * `compressForFeed` hands back the original on every failure path, so this
       * is the same file the uploader would have sent before compression
       * existed — an unsupported browser, an out-of-memory phone or a codec the
       * decoder refuses all end up here with the upload intact.
       */
      /*
       * Nothing goes up until the compressor has settled on an outcome that
       * clears the one-minute cap.
       *
       * Written as "must have a passing result" rather than "must not have a
       * failing one", so a state this component has not thought of — an outcome
       * that never arrived, an encode still running past a disabled button —
       * blocks rather than falls through to the original. The invariant is that
       * no source longer than a minute reaches storage unchanged, and a guard
       * that only rejects the cases it enumerated is one enumeration short of
       * breaking it.
       *
       * The error says processing failed, because that is what happened. A
       * source longer than a minute is supported and trimmed, so telling
       * somebody their video is too long would be both discouraging and untrue.
       */
      if (!optimised.result || mustProcess(optimised.result)) {
        throw new Error(t.clips.processingFailed);
      }

      const outgoing = optimised.result?.file ?? file;

      // 1. Presigned PUT, 2. straight to R2 — the video never transits the API,
      // which matters on mobile data (§14). 3. Confirm, which is what creates the
      // row and moves the bar.
      const ticket = await browserFetch<{
        uploadUrl: string;
        storageKey: string;
        posterUploadUrl: string;
        posterKey: string;
      }>('/media/upload-url', {
        method: 'POST',
        body: {
          // The name decides the object key's extension, so it follows the file
          // actually being sent — `.mp4` once compressed.
          filename: outgoing.name || 'clip.webm',
          type: 'VIDEO',
          category,
          contentType: outgoing.type || 'video/webm',
        },
      });

      await uploadToStorage(ticket.uploadUrl, outgoing, {
        blocked: t.clips.uploadBlocked,
        rejected: t.clips.uploadFailed,
      });

      // The cover is a nicety, so its failure must never cost the clip: capture
      // returns null rather than throwing, and a failed poster PUT is swallowed
      // here. A tile without a cover falls back to a themed placeholder.
      let posterKey: string | undefined;
      // From the optimised copy: the same frames, far cheaper to decode.
      const poster = await capturePoster(outgoing);
      if (poster) {
        const stored = await uploadToStorage(ticket.posterUploadUrl, poster, {
          blocked: '',
          rejected: '',
        })
          .then(() => true)
          .catch(() => false);
        if (stored) posterKey = ticket.posterKey;
      }

      return browserFetch<Media>('/media/confirm', {
        method: 'POST',
        body: {
          storageKey: ticket.storageKey,
          type: 'VIDEO',
          category,
          /*
           * Whether this browser produced the optimised MP4.
           *
           * False sends the clip to the server-side transcoder instead, which is
           * what guarantees the feed never serves an original — a browser
           * without WebCodecs no longer means "skip compression", it means
           * "compress it there".
           */
          optimised: optimised.result?.status === 'compressed',
          ...(category === 'MATCH_HIGHLIGHTS' ? {} : { rating: rating }),
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
          // Omitted means today, server-side; a picked date goes as a bare day.
          ...(autoDate || !recordedOn ? {} : { recordedAt: recordedOn }),
          ...(posterKey ? { posterKey } : {}),
        },
      });
    },
    onSuccess: (created) => {
      onUploaded(created);
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const isHighlight = category === 'MATCH_HIGHLIGHTS';
  const ready = Boolean(file && category);

  return (
    <Card>
      <CardContent className="mt-4 space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {storage && !storage?.configured && (
          <Alert tone="warning" title={t.clips.storageOffTitle}>
            {t.clips.storageOffHint}
          </Alert>
        )}

        {/*
         * How many clips are left, said before recording rather than after.
         *
         * The upload is the expensive part — on a prepaid connection a refused
         * minute of video is real money — so a player who is out of clips should
         * learn it here, not from a red box after the file has gone up.
         */}
        {storage?.quota &&
          (storage?.quota.exceeded ? (
            <Alert tone="warning" title={t.plans.limitReached}>
              {t.plans.clipsNone}
              {storage?.quota.resetsAt && (
                <> {f(t.plans.clipsResetOn, { date: formatDate(storage?.quota.resetsAt) })}</>
              )}
            </Alert>
          ) : (
            <p className="text-muted text-xs">
              {f(t.plans.clipsLeft, {
                count: storage?.quota.remaining,
                days: storage?.quota.windowDays,
              })}
            </p>
          ))}

        {/* Step 1 — the skill. Always first, and the only control on screen
            until it is answered: everything below depends on knowing it. */}
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">
            {t.clips.whatDoesItShow} <span className="text-danger">*</span>
          </legend>
          <p className="text-muted text-xs">{t.clips.categoryHint}</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {ATTRIBUTE_KEYS.map((key) => (
              <CategoryChip
                key={key}
                active={category === ATTRIBUTE_CATEGORY[key]}
                label={t.attributes[key]}
                onClick={() => setCategory(ATTRIBUTE_CATEGORY[key])}
              />
            ))}
            <CategoryChip
              active={isHighlight}
              icon={Trophy}
              label={t.attributes.highlights}
              onClick={() => setCategory('MATCH_HIGHLIGHTS')}
            />
          </div>
        </fieldset>

        {/* Nothing else until a skill is picked — see the note on the component.
            The empty state says what to do rather than leaving a bare panel. */}
        {!category ? (
          <p className="text-muted border-border rounded-lg border border-dashed p-4 text-center text-sm">
            {t.clips.pickCategory}
          </p>
        ) : (
          <>
            {/* Step 2 — what to film, then the means to film it. The instructions
                come first: they are the reason the skill was asked for first. */}
            <ClipTips category={category} />

            {!file ? (
              <div className="space-y-3">
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    const dropped = event.dataTransfer.files?.[0];
                    if (dropped) accept(dropped);
                  }}
                  className={cn(
                    'rounded-xl border-2 border-dashed p-6 text-center transition-colors',
                    dragging ? 'border-primary bg-primary/5' : 'border-border',
                  )}
                >
                  <Upload className="text-muted mx-auto size-7" aria-hidden />
                  <p className="mt-2 text-sm font-medium">{t.clips.dropHere}</p>
                  <p className="text-muted mt-0.5 text-xs">{t.clips.dropHint}</p>

                  <label className="mt-3 inline-block">
                    <input
                      type="file"
                      accept="video/*"
                      className="sr-only"
                      onChange={(event) => {
                        const chosen = event.target.files?.[0];
                        if (chosen) accept(chosen);
                      }}
                    />
                    <span className="border-border hover:bg-surface-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium">
                      <Upload className="size-4" aria-hidden /> {t.clips.chooseFile}
                    </span>
                  </label>
                </div>

                <LiveRecorder
                  onRecorded={accept}
                  onError={setError}
                  onOpenChange={(open) => onRecorderOpenChange?.(open)}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  {previewUrl && (
                    <video
                      src={previewUrl}
                      controls
                      playsInline
                      className="bg-surface-3 max-h-64 w-full rounded-lg"
                    />
                  )}
                  {/* Keeps the skill. Replacing the video is "that take was bad",
                      not "I meant a different skill" — clearing the category here
                      would send the player back to step one for a retake. */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      compressionRef.current?.abort();
                      setOptimised({ status: 'idle', progress: 0, result: null });
                      setFile(null);
                    }}
                  >
                    <X aria-hidden /> {t.clips.replaceClip}
                  </Button>
                </div>

                <OptimiseStatus state={optimised} />

                {/* Said here as well as on submit: a player who cannot upload
                    this clip should learn it while looking at it, not after
                    filling in a rating and a title. */}
                {optimised.result && mustProcess(optimised.result) && (
                  <Alert tone="danger">{t.clips.processingFailed}</Alert>
                )}

                {/* Step 3 — the self review, with what a top score means for this
                    skill in particular. Highlights evidence no single attribute,
                    so they carry no rating at all. */}
                {!isHighlight && (
                  <Field
                    label={`${t.clips.yourRating}: ${rating}`}
                    htmlFor="clip-rating"
                    hint={t.clips.ratingHint}
                  >
                    <input
                      id="clip-rating"
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={rating}
                      onChange={(event) => setRating(Number(event.target.value))}
                      className="accent-primary w-full"
                    />
                    <SelfRatingGuide category={category} rating={rating} />
                  </Field>
                )}

                {/* Step 4 — the optional metadata, last because it is optional. */}
                <Field label={t.clips.clipTitle} htmlFor="clip-title" hint={t.common.optional}>
                  <Input
                    id="clip-title"
                    placeholder={t.placeholders.clipTitle}
                    value={title}
                    maxLength={120}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </Field>

                <Field label={t.clips.description} htmlFor="clip-desc" hint={t.common.optional}>
                  <Textarea
                    id="clip-desc"
                    placeholder={t.placeholders.clipDescription}
                    value={description}
                    maxLength={1000}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>

                {/* When it was filmed. Today unless the player says otherwise;
                    the picker cannot reach tomorrow, and neither can the API. */}
                <label className="border-border bg-surface-2 flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                  <input
                    type="checkbox"
                    checked={autoDate}
                    onChange={(event) => setAutoDate(event.target.checked)}
                    className="accent-primary mt-0.5 size-4 shrink-0 cursor-pointer"
                  />
                  <span>
                    <span className="block text-sm font-medium">{t.clips.autoDate}</span>
                    <span className="text-muted block text-xs">{t.clips.autoDateHint}</span>
                  </span>
                </label>

                {!autoDate && (
                  <Field label={t.clips.recordedOn} htmlFor="clip-recorded-on">
                    <Input
                      id="clip-recorded-on"
                      type="date"
                      value={recordedOn}
                      max={todayInputValue()}
                      onChange={(event) => setRecordedOn(event.target.value)}
                    />
                    {isAfterToday(recordedOn) && (
                      <p className="text-danger mt-1 text-xs">{t.clips.recordedInFuture}</p>
                    )}
                  </Field>
                )}

                {/* Step 5 */}
                <Button
                  onClick={() => upload.mutate()}
                  // Still encoding counts as loading: the button would otherwise
                  // look idle while the thing it needs is being produced.
                  loading={upload.isPending || optimised.status === 'running'}
                  disabled={
                    !ready ||
                    optimised.status !== 'done' ||
                    !optimised.result ||
                    mustProcess(optimised.result)
                  }
                  className="w-full"
                >
                  <Upload aria-hidden /> {t.clips.publish}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * What the encoder is doing, in one line the player can ignore.
 *
 * Deliberately quiet. Compression is an optimisation they did not ask for and do
 * not need to understand — the only thing worth their attention is that a bar is
 * moving and that it saved them something. A skipped clip says so plainly rather
 * than reporting a reason ("unsupported codec") that would read as a fault when
 * the upload is proceeding perfectly normally.
 */
function OptimiseStatus({
  state,
}: {
  state: { status: 'idle' | 'running' | 'done'; progress: number; result: CompressResult | null };
}) {
  const { t, f } = useI18n();

  if (state.status === 'running') {
    return (
      <div className="border-border bg-surface-2 space-y-2 rounded-lg border p-3">
        <p className="flex items-center gap-2 text-xs font-medium">
          <Wand2 className="text-primary size-3.5 shrink-0" aria-hidden />
          {t.clips.optimising}
        </p>
        <div className="bg-surface-3 h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${Math.round(state.progress * 100)}%` }}
          />
        </div>
        <p className="text-muted text-xs leading-snug">{t.clips.optimisingHint}</p>
      </div>
    );
  }

  if (state.status !== 'done' || !state.result) return null;

  if (state.result.status !== 'compressed') {
    return <p className="text-muted text-xs">{t.clips.optimiseSkipped}</p>;
  }

  return (
    <div className="space-y-1">
      <p className="text-success flex items-center gap-1.5 text-xs">
        <Wand2 className="size-3.5 shrink-0" aria-hidden />
        {f(t.clips.optimisedTo, {
          before: formatBytes(state.result.originalBytes),
          after: formatBytes(state.result.bytes),
        })}
      </p>
      {/* Trimming is silent about *whether* to do it, never about having done
          it: a player who filmed two minutes should not discover the second
          half is missing by watching it back on their profile. */}
      {state?.result?.trimmed && (
        <p className="text-muted flex items-center gap-1.5 text-xs">
          <Scissors className="size-3.5 shrink-0" aria-hidden />
          {t.clips.trimmedToLimit}
        </p>
      )}
    </div>
  );
}

/** `41.2 MB`. Rounded hard — nobody is auditing an upload to three decimals. */
function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

function CategoryChip({
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
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
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

/**
 * Records straight from the camera, capped at 60 seconds.
 *
 * Recording in the browser rather than asking for a file matters here: the
 * players are teenagers on phones, and "film it now" is a far shorter path than
 * "record in the camera app, find the file, upload it". The hard stop at
 * `MAX_SECONDS` is enforced by a timer rather than by trusting the user, and the
 * stream tracks are stopped on every exit path — a camera left running is both a
 * battery drain and, on a minor's phone, a privacy problem (§11).
 */
/**
 * The button that opens the camera, and nothing else.
 *
 * The recorder itself is a full-screen overlay rather than a panel in the form.
 * A viewfinder the size of a form field is one nobody can frame a shot in — a
 * player filming themselves at arm's length cannot tell whether their feet are in
 * frame, and a clip that turns out to have cut them off costs one of their
 * uploads for the week to discover.
 */
function LiveRecorder({
  onRecorded,
  onError,
  onOpenChange,
}: {
  onRecorded: (file: File) => void;
  onError: (message: string) => void;
  /**
   * Announced upward so the dialog this sits inside can ignore interactions
   * while the camera is up — see the note on `RecorderOverlay`.
   */
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);

  const setRecorder = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange(next);
    },
    [onOpenChange],
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setRecorder(true)}
        className="bg-surface-2 w-full cursor-pointer"
      >
        <Disc aria-hidden className="text-red-600" /> {t.clips.recordNow}
      </Button>

      {open && (
        <RecorderOverlay
          onRecorded={(file) => {
            setRecorder(false);
            onRecorded(file);
          }}
          onError={(message) => {
            setRecorder(false);
            onError(message);
          }}
          onClose={() => setRecorder(false)}
        />
      )}
    </>
  );
}

/**
 * The camera, full screen.
 *
 * ## Why an overlay and not a bigger box
 *
 * This is a viewfinder. Everything about it — the size, the black surround, the
 * one large control at the bottom — exists so the person can see what they are
 * filming while they are filming it, on a phone, at arm's length, outdoors.
 *
 * ## The preview tells the truth about the recording
 *
 * The recording keeps the camera's whole frame however the preview is displayed,
 * so a preview that crops is a viewfinder that lies. `previewFit` uses `cover`
 * while the crop is a trim and switches to `contain` once it would start hiding
 * content — see its note. Neither ever stretches.
 *
 * ## Recording is a second, deliberate press
 *
 * Opening the camera and starting to record are separate acts. The old recorder
 * began the moment the button was pressed, which meant the first seconds of every
 * clip were somebody finding their framing — and under a sixty-second cap those
 * seconds are not free.
 *
 * ## Why the camera cannot be switched mid-recording
 *
 * Not caution — the specification. `MediaRecorder` takes its `MediaStream` at
 * construction and exposes it `readonly`; there is no `replaceTrack` outside
 * WebRTC. The only way to change the video during a take is to mutate the stream
 * the recorder is holding, and the MediaStream Recording spec says that a track
 * added to or removed from a recording stream makes the UA "immediately stop
 * gathering data, **discard any data that it has gathered**" and fire
 * `InvalidModificationError`.
 *
 * So the swap does not corrupt the recording, it destroys it — a player would
 * tap the switch forty seconds in and lose the whole take. The alternatives are
 * a canvas pipeline or insertable streams, which cost quality and battery on the
 * phones this runs on and are supported nowhere near universally. The button is
 * disabled while recording instead, which is the honest answer: the camera is
 * chosen before the take, and the take is never at risk.
 */
function RecorderOverlay({
  onRecorded,
  onError,
  onClose,
}: {
  onRecorded: (file: File) => void;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  /** Wall-clock start, so the timer cannot drift the way a counter does. */
  const startedAtRef = React.useRef<number>(0);
  /**
   * Set the moment a take is abandoned, and read inside `onstop`.
   *
   * Stopping the stream's tracks ends the recording — the spec says a recorder
   * whose tracks have all ended stops and fires `stop`. So cancelling used to
   * reach `onRecorded` by that route and hand the discarded take to the upload
   * pipeline: the player pressed close, confirmed they wanted it gone, and it
   * uploaded anyway. Unmounting mid-recording did the same thing, and additionally
   * called back into a component that no longer existed.
   *
   * A ref rather than state because `onstop` fires outside React's update cycle
   * and would read a stale value from a closure.
   */
  const abandonedRef = React.useRef(false);
  /** The camera's own aspect, kept so the fit can be recomputed on rotation. */
  const cameraAspectRef = React.useRef<number | null>(null);
  /**
   * Set once the camera has been given up for good.
   *
   * A switch is an `await` with a camera at the end of it, and the person can
   * press close while it is in flight. Without this the stream would arrive after
   * the overlay had gone and stay live — a camera running behind a closed
   * viewfinder, which is the privacy problem (§11) rather than a tidiness one.
   */
  const releasedRef = React.useRef(false);
  /**
   * Whether a switch is already under way — a ref, not the state below.
   *
   * `disabled` on the button only takes effect on the next render, so two taps
   * inside one frame both pass a check that reads state. Two concurrent
   * `getUserMedia` calls is precisely the "two live cameras" case the swap is
   * built to make impossible, so the guard has to be one that updates the
   * instant it is read.
   */
  const switchingRef = React.useRef(false);

  const [phase, setPhase] = React.useState<'starting' | 'ready' | 'recording' | 'saving'>(
    'starting',
  );
  const [elapsed, setElapsed] = React.useState(0);
  const [fit, setFit] = React.useState<'cover' | 'contain'>('cover');
  /** Which camera is live. `null` on a webcam that reports no front/rear. */
  const [facing, setFacing] = React.useState<Facing | null>(null);
  /** How many cameras the device has; `null` while unknown or unreadable. */
  const [cameras, setCameras] = React.useState<number | null>(null);
  const [switching, setSwitching] = React.useState(false);
  /** A failed switch says so *here* — never through `onError`, which closes. */
  const [switchFailed, setSwitchFailed] = React.useState(false);

  /**
   * Ends the take without producing a file.
   *
   * The order matters: the flag is set *before* anything that could trigger
   * `onstop`, or the callback wins the race and uploads what was just discarded.
   */
  const abandon = React.useCallback(() => {
    abandonedRef.current = true;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    recorderRef.current = null;
  }, []);

  const stopTracks = React.useCallback(() => {
    releasedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  /**
   * Puts a stream on screen and makes it the one everything else acts on.
   *
   * The single place `streamRef` and `srcObject` are set together, so they cannot
   * drift into the state where the recorder records one camera and the viewfinder
   * shows another.
   */
  const show = React.useCallback(async (stream: MediaStream) => {
    streamRef.current = stream;
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    await videoRef.current.play().catch(() => undefined);
  }, []);

  /*
   * The camera is released on every exit path, including navigating away.
   *
   * A camera left running is a battery drain and, on a minor's phone, a privacy
   * problem (§11) — which is why this is an unconditional unmount cleanup rather
   * than something each button remembers to call.
   */
  React.useEffect(
    () => () => {
      // Abandon first: releasing the camera is what makes the recorder fire, and
      // an unmounted component must not be handed a file.
      abandon();
      stopTracks();
    },
    [abandon, stopTracks],
  );

  /*
   * The page behind must not scroll while the viewfinder is up.
   *
   * Without this a swipe to reframe scrolls the form underneath, and on iOS the
   * address bar reappears mid-recording and resizes the viewport.
   */
  React.useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /*
   * The fit is re-decided whenever the viewport changes shape.
   *
   * Turning the phone swaps which axis is longer, so a preview that was a
   * faithful `cover` in portrait can become a heavy crop in landscape. Deciding
   * once on `loadedmetadata` would leave the viewfinder lying about the frame
   * from the moment the device was rotated.
   */
  React.useEffect(() => {
    const recompute = () => {
      setFit(previewFit(cameraAspectRef.current, window.innerWidth / window.innerHeight));
    };

    window.addEventListener('resize', recompute);
    window.addEventListener('orientationchange', recompute);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('orientationchange', recompute);
    };
  }, []);

  // Opening the camera is the first thing that happens, before any control is
  // offered — there is nothing to decide until the permission prompt is answered.
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      // Capability is discovered by trying, not by a `useState` seeded in an
      // effect: the server cannot know whether this browser has a camera. Every
      // failure — no MediaRecorder, no camera, denied permission, insecure
      // origin — ends with the same message.
      const media = navigator.mediaDevices;
      if (typeof MediaRecorder === 'undefined' || !media?.getUserMedia) {
        onError(t.clips.cameraUnavailable);
        return;
      }

      // Rear first, front if there is no rear one. The fallback is silent: a
      // laptop having no back camera is not something to interrupt anybody over.
      const opened = await openCamera((constraints) => media.getUserMedia(constraints));

      if (!opened) {
        if (!cancelled) onError(t.clips.cameraUnavailable);
        return;
      }

      // The overlay closed while the permission prompt was open. Nothing is
      // rendered to attach this to, so it is released rather than left running.
      if (cancelled) {
        opened.stream.getTracks().forEach((track) => track.stop());
        return;
      }

      setFacing(opened.facing);
      await show(opened.stream);
      setPhase('ready');

      // Asked only now: before permission is granted the device list is stripped
      // of everything but the count, and this is the count we need.
      const count = await countCameras(() => media.enumerateDevices());
      if (!cancelled) setCameras(count);
    })();

    return () => {
      cancelled = true;
    };
    // Once, on open. `onError` closes the overlay, so re-running would reopen the
    // camera against an unmounting component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = React.useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      setPhase('saving');
      recorderRef.current.stop();
    }
  }, []);

  /**
   * Turns the camera around.
   *
   * Only reachable while `ready` — see the note above on why a take cannot
   * survive this. Everything that can go wrong is handled without leaving the
   * viewfinder: `switchCamera` hands back a working stream even when it could not
   * switch, and the only case it cannot is one where the camera is genuinely gone
   * and the existing unavailable message is the right answer.
   */
  const flip = React.useCallback(async () => {
    const current = streamRef.current;
    if (!current || !facing || switchingRef.current) return;

    switchingRef.current = true;
    setSwitching(true);
    setSwitchFailed(false);

    const result = await switchCamera(current, facing, (constraints) =>
      navigator.mediaDevices.getUserMedia(constraints),
    );

    // Closed while the camera was being handed over. Whatever arrived is
    // released rather than left running behind a viewfinder that has gone.
    if (releasedRef.current) {
      result.stream?.getTracks().forEach((track) => track.stop());
      // Left latched: the overlay is on its way out and must not start another.
      return;
    }

    switchingRef.current = false;
    setSwitching(false);

    if (!result.stream) {
      onError(t.clips.cameraUnavailable);
      return;
    }

    setFacing(result.facing);
    await show(result.stream);
    // Non-blocking, and deliberately not `onError`: the camera they had still
    // works, so closing the recorder over it would take away more than it gives.
    if (!result.ok) setSwitchFailed(true);
  }, [facing, onError, show, t.clips.cameraUnavailable]);

  /* The toast says its piece and goes; nothing here is worth a dismiss button. */
  React.useEffect(() => {
    if (!switchFailed) return;
    const id = setTimeout(() => setSwitchFailed(false), 4000);
    return () => clearTimeout(id);
  }, [switchFailed]);

  const start = () => {
    const stream = streamRef.current;
    if (!stream) return;

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stopTracks();
      // Cancelled, or the overlay went away. The take is dropped rather than
      // uploaded — see `abandonedRef`.
      if (abandonedRef.current) return;

      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      // Straight into the existing pipeline: `accept` validates it, then
      // compression trims and re-encodes before anything is uploaded.
      onRecorded(new File([blob], `clip-${Date.now()}.webm`, { type: blob.type }));
    };

    abandonedRef.current = false;
    recorder.start();
    startedAtRef.current = Date.now();
    setElapsed(0);
    setPhase('recording');

    /*
     * Driven by the clock, not by counting ticks.
     *
     * A counter incremented every second drifts whenever the tab is throttled or
     * a frame is slow, so a "60 second" clip could run over the cap the encoder
     * then has to trim. Reading elapsed time keeps the displayed number and the
     * hard stop honest, and the faster interval is what makes it tick smoothly.
     */
    timerRef.current = setInterval(() => {
      const seconds = (Date.now() - startedAtRef.current) / 1000;
      // Clamped: `stop()` is asynchronous, so without this the clock ticks past
      // the cap — 01:01 on a clip the encoder is about to cut at 01:00 — while
      // the recorder is still finishing.
      setElapsed(Math.min(seconds, MAX_SECONDS));
      if (seconds >= MAX_SECONDS) stop();
    }, 200);
  };

  /** Closing mid-recording throws the take away, so it asks first. */
  const close = () => {
    if (phase === 'recording' && !window.confirm(t.clips.discardRecording)) return;
    abandon();
    stopTracks();
    onClose();
  };

  const overlay = (
    <div
      // `overscroll-contain` alongside the body lock: on iOS a body with
      // `overflow: hidden` still rubber-bands, and a swipe to reframe should not
      // drag the page behind the viewfinder.
      /*
       * `pointer-events-auto` is load-bearing, not tidiness.
       *
       * A Radix modal sets `pointer-events: none` on `<body>` while it is open,
       * and this overlay is portalled to the body — so it inherited that and
       * every tap fell straight *through* it to the dialog's backdrop beneath,
       * which Radix then read as an outside click and dismissed the whole Add
       * Clip dialog. The camera went with it.
       */
      className="pointer-events-auto fixed inset-0 z-[60] flex touch-none flex-col overscroll-contain bg-black"
      // `dvh` rather than `vh`: on mobile the address bar shrinks the viewport as
      // it hides, and `vh` keeps the old height — which pushes the stop button
      // under the browser chrome exactly when it is needed.
      style={{ height: '100dvh' }}
      role="dialog"
      aria-modal="true"
      aria-label={t.clips.recordNow}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        /*
         * The front camera is mirrored, the rear one is not.
         *
         * People are used to seeing themselves in a mirror, and an unmirrored
         * selfie preview reads as subtly wrong — you raise your left hand and the
         * person on screen raises the other one, which makes framing a shot
         * harder than it should be. Every phone camera does this.
         *
         * The *preview* only: the recording comes off the MediaStream, which CSS
         * cannot touch. So the clip a scout watches is the way round the camera
         * actually saw it, and any writing in shot stays readable.
         */
        className="absolute inset-0 size-full"
        style={{
          objectFit: fit,
          transform: facing === 'user' ? 'scaleX(-1)' : undefined,
        }}
        onLoadedMetadata={(event) => {
          const element = event.currentTarget;
          cameraAspectRef.current = element.videoWidth / element.videoHeight;
          setFit(previewFit(cameraAspectRef.current, window.innerWidth / window.innerHeight));
        }}
      />

      {/* Close, top-left, clear of the notch. */}
      <div
        className="relative flex items-start justify-between p-4"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}
      >
        <button
          type="button"
          onClick={close}
          aria-label={t.common.cancel}
          className="grid size-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm"
        >
          <X className="size-5" aria-hidden />
        </button>

        {phase === 'recording' && (
          <span className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm">
            <span className="bg-danger size-2.5 animate-pulse rounded-full" aria-hidden />
            REC
          </span>
        )}
      </div>

      <div className="relative flex-1" />

      {/* Everything the person acts on sits at the bottom, within thumb reach. */}
      <div
        className="relative flex flex-col items-center gap-3 px-6"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}
      >
        {phase === 'ready' && (
          <p className="rounded-lg bg-black/55 px-3 py-1.5 text-center text-xs text-white backdrop-blur-sm">
            {t.clips.recordingHint}
          </p>
        )}

        {(phase === 'recording' || phase === 'saving') && (
          <>
            <span className="font-mono text-2xl font-bold text-white tabular-nums drop-shadow-lg">
              {formatTimer(elapsed)}
            </span>
            <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-white/25">
              <div
                className="bg-danger h-full rounded-full"
                style={{ width: `${Math.min(100, (elapsed / MAX_SECONDS) * 100)}%` }}
              />
            </div>
          </>
        )}

        {phase === 'starting' && <p className="text-sm text-white/80">{t.clips.cameraStarting}</p>}
        {phase === 'saving' && <p className="text-sm text-white/80">{t.clips.recordingSaved}</p>}

        {/* A switch that could not happen. The camera they had is still running,
            so this states the fact and gets out of the way. */}
        {switchFailed && (
          <p
            role="status"
            className="rounded-lg bg-black/70 px-3 py-1.5 text-center text-xs text-white backdrop-blur-sm"
          >
            {t.clips.switchCameraFailed}
          </p>
        )}

        {/*
          The record button is 72px and stays dead-centre whether or not there is
          a camera to switch to, so it does not move under the thumb from one
          device to the next — which is why the switch is positioned against this
          row rather than laid out beside it. Both are far enough above the bottom
          edge that the browser's own gestures do not compete with them.
        */}
        <div className="relative flex w-full items-center justify-center">
          {phase === 'ready' && (
            <button
              type="button"
              onClick={start}
              disabled={switching}
              aria-label={t.clips.startRecording}
              className="grid size-[72px] place-items-center rounded-full border-4 border-white/90 bg-transparent disabled:opacity-50"
            >
              <span className="bg-danger size-14 rounded-full transition-transform active:scale-90" />
            </button>
          )}

          {phase === 'recording' && (
            <button
              type="button"
              onClick={stop}
              aria-label={t.clips.stop}
              className="grid size-[72px] place-items-center rounded-full border-4 border-white/90 bg-transparent"
            >
              <span className="bg-danger size-8 rounded-lg transition-transform active:scale-90" />
            </button>
          )}

          {phase !== 'ready' && phase !== 'recording' && (
            <div className="size-[72px]" aria-hidden />
          )}

          {/*
            Bottom-right, and only where there is a second camera to reach.
            56px — past the 44px touch minimum — and sharing the translucent
            black of the close button, so the two read as the same set of
            controls rather than as a stray addition.

            Disabled during a take, and visibly so: `MediaRecorder` cannot be
            handed a different camera without discarding what it has recorded, so
            the choice is made before the take starts (see the note on this
            component). `aria-disabled` alongside `disabled` because the reason
            belongs in the accessible name, not just in the opacity.
          */}
          {offersSwitch(facing, cameras) && (
            <button
              type="button"
              onClick={flip}
              disabled={phase !== 'ready' || switching}
              aria-disabled={phase !== 'ready' || switching}
              aria-label={t.clips.switchCamera}
              title={phase === 'recording' ? t.clips.switchCameraLocked : t.clips.switchCamera}
              className={cn(
                'absolute right-0 grid size-14 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition',
                phase === 'ready' && !switching
                  ? 'active:scale-90'
                  : 'cursor-not-allowed opacity-40',
              )}
            >
              <SwitchCamera className={cn('size-6', switching && 'animate-spin')} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  /*
   * Portalled to the body.
   *
   * The uploader is already inside a dialog, and a `fixed` element inside one
   * inherits its stacking context — so without this the "full-screen" camera
   * would be clipped to the dialog it was opened from.
   */
  return typeof document === 'undefined' ? null : createPortal(overlay, document.body);
}

/**
 * What to actually film, once a category is chosen.
 *
 * The category names are the six card attributes (§21.1), and on their own they
 * are a label rather than an instruction: "Technique" does not tell a
 * thirteen-year-old whether to juggle, dribble or shoot, and a clip that shows
 * the wrong thing gets re-recorded — which under the plan limits costs them one
 * of their uploads for the week.
 *
 * Split by player and goalkeeper because for a keeper almost every category
 * means something different: "Passing" is distribution, "Finishing" is stopping
 * one. Both are shown rather than guessing from the player's position, since the
 * position is optional on the profile and wrong guidance is worse than two lines.
 *
 * The camera note is last and shared: it applies to every clip, and it is the
 * single most common reason a clip is unusable.
 */
/**
 * The three bands the slider is asking the player to place themselves in.
 *
 * ## Why bands and not one sentence
 *
 * This showed only what a 100 meant, which answered the wrong question. Nobody
 * scoring themselves is deciding whether they are perfect — they are deciding
 * between roughly-good and roughly-very-good, and a description of the ceiling
 * gives them nothing to measure that against. Three anchors turn an arbitrary
 * 0–100 slider into a choice with edges: I beat one defender, not several, so I
 * am in the middle band.
 *
 * ## Why the thresholds are drawn here and the sentences are not
 *
 * `30`, `60` and `90` are numerals — identical in all three languages, and a
 * dictionary entry holding one would be a string nobody could usefully change.
 * The sentences differ completely per skill and per language, so they live in
 * `t.clipTips` beside the filming instructions: one place per skill, which is
 * what stops the guidance for a skill drifting from the description of it.
 *
 * The band the slider currently sits in is marked, so the panel reads as a
 * response to what they just chose rather than a wall of advice.
 */
const RATING_BANDS = [
  { from: 30, key: 'low' },
  { from: 60, key: 'mid' },
  { from: 90, key: 'high' },
] as const;

function SelfRatingGuide({ category, rating }: { category: Category; rating: number }) {
  const { t } = useI18n();
  const tips = t.clipTips[category as keyof typeof t.clipTips];

  // Guards a category added to the enum before its copy is written.
  if (!tips || typeof tips === 'string' || !tips.bands) return null;

  // The highest band the rating has reached, or none while it is still below 30.
  const reached = [...RATING_BANDS].reverse().find((band) => rating >= band.from);

  return (
    <div className="border-border bg-surface-2 mt-2 space-y-1.5 rounded-lg border p-2.5">
      {RATING_BANDS.map((band) => {
        const active = reached?.key === band.key;
        return (
          <p
            key={band.key}
            className={cn(
              'flex gap-2 text-xs leading-snug transition-colors',
              active ? 'text-foreground' : 'text-muted',
            )}
          >
            <span
              className={cn(
                'w-9 shrink-0 text-right font-semibold tabular-nums',
                active && 'text-primary',
              )}
            >
              {band.from}+
            </span>
            <span>{tips.bands[band.key]}</span>
          </p>
        );
      })}
    </div>
  );
}

function ClipTips({ category }: { category: Category }) {
  const { t } = useI18n();
  const tips = t.clipTips[category as keyof typeof t.clipTips];

  // MATCH_HIGHLIGHTS and the six attributes all have entries; this guards a
  // category added to the enum before its copy is written.
  if (!tips || typeof tips === 'string') return null;

  return (
    <div className="border-border bg-surface-2 space-y-2 rounded-lg border p-3">
      <p className="text-xs leading-snug">
        <span className="font-semibold">{t.clipTips.playerLabel}:</span>{' '}
        <span className="text-muted">{tips?.player}</span>
      </p>
      <p className="text-xs leading-snug">
        <span className="font-semibold">{t.clipTips.goalkeeperLabel}:</span>{' '}
        <span className="text-muted">{tips?.goalkeeper}</span>
      </p>
      <p className="text-muted border-border border-t pt-2 text-xs leading-snug">
        {t.clipTips.camera}
      </p>
    </div>
  );
}
