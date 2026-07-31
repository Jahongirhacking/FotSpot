'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleStop, Trophy, Upload, Video, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import { uploadToStorage } from '@/lib/api/upload';
import type { Media, MediaCategory } from '@/lib/api/types';
import { ATTRIBUTE_CATEGORY, ATTRIBUTE_KEYS } from '@/lib/player-card';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { cn } from '@/lib/utils';

/** §21.6 — a clip is a proof, not a highlight reel. One minute is the cap. */
const MAX_SECONDS = 60;
const MAX_BYTES = 120 * 1024 * 1024;

type Category = MediaCategory;

/**
 * Uploads a clip and the attribute claim it evidences.
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
  onCancel,
}: {
  onUploaded: (media: Media) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();

  const [file, setFile] = React.useState<File | null>(null);
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
    queryFn: () => browserFetch<{ configured: boolean }>('/media/storage-status'),
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
  };

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !category) throw new Error(t.clips.pickCategory);

      // 1. Presigned PUT, 2. straight to R2 — the video never transits the API,
      // which matters on mobile data (§14). 3. Confirm, which is what creates the
      // row and moves the bar.
      const ticket = await browserFetch<{ uploadUrl: string; storageKey: string }>(
        '/media/upload-url',
        {
          method: 'POST',
          body: {
            filename: file.name || 'clip.webm',
            type: 'VIDEO',
            category,
            contentType: file.type || 'video/webm',
          },
        },
      );

      await uploadToStorage(ticket.uploadUrl, file, {
        blocked: t.clips.uploadBlocked,
        rejected: t.clips.uploadFailed,
      });

      return browserFetch<Media>('/media/confirm', {
        method: 'POST',
        body: {
          storageKey: ticket.storageKey,
          type: 'VIDEO',
          category,
          ...(category === 'MATCH_HIGHLIGHTS' ? {} : { selfRating: rating }),
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
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
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Video className="text-primary size-4" aria-hidden /> {t.clips.addClip}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label={t.common.cancel}>
          <X aria-hidden />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {storage && !storage.configured && (
          <Alert tone="warning" title={t.clips.storageOffTitle}>
            {t.clips.storageOffHint}
          </Alert>
        )}

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
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setFile(null);
                  setCategory(null);
                }}
              >
                <X aria-hidden /> {t.clips.replaceClip}
              </Button>
            </div>

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

            {category && !isHighlight && (
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
              </Field>
            )}

            <Field label={t.clips.clipTitle} htmlFor="clip-title" hint={t.common.optional}>
              <Input
                id="clip-title"
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>

            <Field label={t.clips.description} htmlFor="clip-desc" hint={t.common.optional}>
              <Textarea
                id="clip-desc"
                value={description}
                maxLength={1000}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            <Button
              onClick={() => upload.mutate()}
              loading={upload.isPending}
              disabled={!ready}
              className="w-full"
            >
              <Upload aria-hidden /> {t.clips.publish}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
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
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
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
        const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
        cleanup();
        onRecorded(new File([blob], `clip-${Date.now()}.webm`, { type: blob.type }));
      };

      recorder.start();
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
