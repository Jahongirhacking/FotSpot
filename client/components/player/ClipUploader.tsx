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
import { compressForFeed, MAX_DURATION_SECONDS, mustProcess } from '@/lib/video/compress';
import type { CompressResult } from '@/lib/video/compress.types';
import { cn, formatDate } from '@/lib/utils';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleStop, Scissors, Trophy, Upload, Video, Wand2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

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
}: {
  onUploaded: (media: Media) => void;
  onCancel: () => void;
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
  const [rating, setRating] = React.useState(70);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
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
          ...(category === 'MATCH_HIGHLIGHTS' ? {} : { rating: rating }),
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
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

                <LiveRecorder onRecorded={accept} onError={setError} />
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
                    <TopScoreTip category={category} />
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
      {state.result.trimmed && (
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
function LiveRecorder({
  onRecorded,
  onError,
}: {
  onRecorded: (file: File) => void;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const [recording, setRecording] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);

  const cleanup = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRecording(false);
    setElapsed(0);
  }, []);

  // Also covers navigating away mid-recording.
  React.useEffect(() => cleanup, [cleanup]);

  const stop = React.useCallback(() => {
    if (recorderRef?.current?.state === 'recording') recorderRef?.current.stop();
  }, []);

  const start = async () => {
    try {
      // Capability is discovered by trying, not by a `useState` seeded in an
      // effect: the server cannot know whether this browser has a camera, so
      // rendering one answer and correcting it after hydration would flash the
      // button in and out. Every failure — no MediaRecorder, no camera, denied
      // permission, insecure origin — lands in the same catch.
      if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('unsupported');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder?.mimeType || 'video/webm' });
        cleanup();
        onRecorded(new File([blob], `clip-${Date.now()}.webm`, { type: blob.type }));
      };

      recorder?.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((seconds) => {
          if (seconds + 1 >= MAX_SECONDS) stop();
          return seconds + 1;
        });
      }, 1000);
    } catch {
      // All the same to the user, who just needs the file picker instead.
      cleanup();
      onError(t.clips.cameraUnavailable);
    }
  };

  return (
    <div className="border-border rounded-xl border p-3">
      <video
        ref={videoRef}
        muted
        playsInline
        className={cn('bg-surface-3 w-full rounded-lg', recording ? 'block' : 'hidden')}
      />

      {recording ? (
        <div className="mt-2 flex items-center gap-3">
          <Button variant="danger" size="sm" onClick={stop}>
            <CircleStop aria-hidden /> {t.clips.stop}
          </Button>
          <span className="font-mono text-sm tabular-nums">
            {elapsed}s / {MAX_SECONDS}s
          </span>
          <div className="bg-surface-3 h-1.5 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-danger h-full rounded-full transition-all"
              style={{ width: `${(elapsed / MAX_SECONDS) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={start} className="w-full">
          <Video aria-hidden /> {t.clips.recordNow}
        </Button>
      )}
    </div>
  );
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
 * What a score near 100 means for this particular skill.
 *
 * ## Why it is per-skill and not one sentence
 *
 * "100 = excellent" tells a fourteen-year-old nothing. Excellent *at what* is the
 * question, and the answer differs completely between skills — a top Pace clip is
 * about acceleration held to the line, a top Passing clip is about weight and
 * both feet. Without it the slider is a number with no anchor, and every player
 * lands on the same optimistic 80.
 *
 * It sits beside the slider rather than replacing `t.clips.ratingHint`, which is
 * the sentence that says this is the player's own claim and stays self-reported
 * until a coach signs it off (§1.6). The two answer different questions: one is
 * "what am I scoring", the other is "what does my score count for".
 *
 * The copy lives in `t.clipTips` beside the filming instructions for the same
 * reason those do — one place per skill, so the guidance for a skill cannot drift
 * apart from the description of it.
 */
function TopScoreTip({ category }: { category: Category }) {
  const { t } = useI18n();
  const tips = t.clipTips[category as keyof typeof t.clipTips];

  if (!tips || typeof tips === 'string' || !tips.high) return null;

  return (
    <p className="border-border bg-surface-2 text-muted mt-2 rounded-lg border p-2.5 text-xs leading-snug">
      {/* The numeral is rendered here rather than translated: "100" is the same
          in all three languages and a dictionary entry holding one would be a
          string nobody could usefully change. */}
      <span className="text-foreground font-semibold">100 —</span> {tips.high}
    </p>
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
