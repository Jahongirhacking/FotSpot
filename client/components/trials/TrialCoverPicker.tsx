'use client';

import { ImagePlus, Loader2, X } from 'lucide-react';
import * as React from 'react';

import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { LoadingImage } from '@/components/ui/LoadingImage';
import { browserFetch } from '@/lib/api/browser';
import { uploadToStorage } from '@/lib/api/upload';

/** What the browser will actually decode, and what R2 is asked to hold. */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export interface TrialCover {
  /** R2 object key — what the API stores. */
  key: string;
  /** Public URL, for the preview only. */
  url: string;
}

/**
 * The optional cover image on a trial.
 *
 * ## It reuses the academy's own upload, deliberately
 *
 * `POST /academies/:id/images/upload-url` already mints a presigned PUT under
 * that academy's media prefix, and the caller has to be its manager — which is
 * exactly who creates a trial. A second endpoint would be a second place the
 * key-minting rule could drift, and the server refuses a cover key that is not
 * under the academy's own prefix anyway (`assertOwnCoverKey`).
 *
 * ## Uploaded before the trial exists
 *
 * The object lands in the bucket when the manager picks it, not when the form is
 * submitted — there is no trial id to hang it on yet, and making the picture
 * wait would mean a submit that silently takes another ten seconds. The cost is
 * an orphaned object if they upload a cover and then abandon the form. That is
 * the same trade the academy gallery makes, and the alternative (holding the
 * file in memory and uploading on submit) turns one slow step into a slow
 * submit that can fail after the trial is already created.
 */
export function TrialCoverPicker({
  academyId,
  cover,
  busy,
  error,
  onBusy,
  onError,
  onPicked,
}: {
  academyId: string;
  cover: TrialCover | null;
  busy: boolean;
  error: string | null;
  onBusy: (busy: boolean) => void;
  onError: (error: string | null) => void;
  onPicked: (cover: TrialCover | null) => void;
}) {
  const { t } = useI18n();
  const input = React.useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    onError(null);

    /*
     * Checked here as well as by `accept`, because `accept` is a filter on the
     * file dialog and not a rule: a drag-and-drop or a renamed file walks past
     * it. The server is still the authority — this only fails fast.
     */
    if (!ACCEPTED.includes(file.type)) {
      onError(t.trials.coverType);
      return;
    }
    if (file.size > MAX_BYTES) {
      onError(t.trials.coverTooLarge);
      return;
    }

    onBusy(true);
    try {
      const ticket = await browserFetch<{ uploadUrl: string; storageKey: string }>(
        `/academies/${academyId}/images/upload-url`,
        { method: 'POST', body: { filename: file.name || 'cover.jpg' } },
      );
      await uploadToStorage(ticket.uploadUrl, file, {
        blocked: t.clips.uploadBlocked,
        rejected: t.clips.uploadFailed,
      });
      // A local object URL for the preview: the R2 object is there, but a
      // public CDN URL can lag by a moment and a blank frame reads as failure.
      onPicked({ key: ticket.storageKey, url: URL.createObjectURL(file) });
    } catch (problem) {
      onError(problem instanceof Error ? problem.message : t.clips.uploadFailed);
    } finally {
      onBusy(false);
      // Cleared so picking the same file twice still fires `change`.
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      {error && <Alert tone="danger">{error}</Alert>}

      {cover ? (
        <div className="border-border relative aspect-video w-full overflow-hidden rounded-lg border">
          <LoadingImage src={cover.url} alt="" className="size-full object-cover" />
          <button
            type="button"
            onClick={() => onPicked(null)}
            aria-label={t.common.delete}
            className="absolute top-2 right-2 z-20 grid size-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="w-full"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> {t.trials.coverUploading}
            </>
          ) : (
            <>
              <ImagePlus className="size-4" aria-hidden /> {t.trials.coverUpload}
            </>
          )}
        </Button>
      )}

      {/*
        `type="file"` inside a form would be submitted with it; it carries no
        name, so `FormData` never sees it and the parent reads the key from
        state instead.
      */}
      <input
        ref={input}
        id="trial-cover"
        type="file"
        accept={ACCEPTED.join(',')}
        hidden
        onChange={(event) => void pick(event.target.files?.[0])}
      />
    </div>
  );
}
