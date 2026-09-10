'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, Images, Loader2, Trash2, Upload } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import { uploadToStorageWithProgress } from '@/lib/api/upload';
import type { BlogPostImage } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Alert } from '@/components/ui/Feedback';
import { LoadingImage } from '@/components/ui/LoadingImage';

/** Bigger than this is a photo nobody resized; the article would load slowly for everyone. */
const MAX_MB = 8;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

/**
 * The pictures that go *inside* a post.
 *
 * The cover has its own slot in the editor. Everything else — the second
 * photo, the diagram, the screenshot — needs a public address to paste into
 * the Markdown, and this is where it is made. The loop is: upload, copy, paste,
 * preview. An admin never sees a storage key: the API mints the key, the
 * browser PUTs to it, the API confirms the object arrived and hands back the
 * CDN URL, and that URL is the only thing shown.
 *
 * Each upload reports its own progress and its own failure, so three photos
 * dropped at once do not become one anonymous spinner. Deleting asks first,
 * because an image already pasted into the content becomes a broken picture
 * the moment it is gone.
 */
export function BlogMediaPanel({
  postId,
  initialImages,
}: {
  /** Empty or null until the draft is saved — nothing to attach an upload to yet. */
  postId: string | null;
  initialImages: BlogPostImage[];
}) {
  const { t } = useI18n();
  if (!postId) return <Alert tone="info">{t.blog.mediaSaveFirst}</Alert>;
  return <MediaPanel postId={postId} initialImages={initialImages} />;
}

function MediaPanel({ postId, initialImages }: { postId: string; initialImages: BlogPostImage[] }) {
  const { t, f } = useI18n();
  const queryClient = useQueryClient();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = React.useState<UploadState[]>([]);
  const [pendingDelete, setPendingDelete] = React.useState<BlogPostImage | null>(null);

  const images = useQuery({
    queryKey: ['blog-images', postId],
    queryFn: () => browserFetch<BlogPostImage[]>(`/blog/admin/posts/${postId}/images`),
    initialData: initialImages,
  });

  const patchUpload = (id: string, patch: Partial<UploadState>) =>
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  /** One file, start to finish: ticket, PUT with progress, confirm, list refresh. */
  const uploadOne = async (file: File) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const preview = URL.createObjectURL(file);
    setUploads((list) => [{ id, name: file.name, preview, progress: 0, error: null }, ...list]);

    try {
      if (!ACCEPT.split(',').includes(file.type)) throw new Error(t.blog.mediaOnlyImages);
      if (file.size > MAX_MB * 1024 * 1024) {
        throw new Error(f(t.blog.mediaTooLarge, { max: MAX_MB }));
      }
      const ticket = await browserFetch<{ uploadUrl: string; storageKey: string }>(
        `/blog/admin/posts/${postId}/images/upload-url`,
        {
          method: 'POST',
          body: { filename: file.name || 'image.jpg', purpose: 'body', contentType: file.type },
        },
      );
      await uploadToStorageWithProgress(
        ticket.uploadUrl,
        file,
        { blocked: t.blog.uploadFailed, rejected: t.blog.uploadFailed },
        (fraction) => patchUpload(id, { progress: fraction }),
      );
      await browserFetch<BlogPostImage>(`/blog/admin/posts/${postId}/images`, {
        method: 'POST',
        body: { storageKey: ticket.storageKey },
      });
      await queryClient.invalidateQueries({ queryKey: ['blog-images', postId] });
      setUploads((list) => list.filter((u) => u.id !== id));
      URL.revokeObjectURL(preview);
    } catch (problem) {
      // The preview stays with the error row until it is dismissed.
      patchUpload(id, {
        error: problem instanceof Error ? problem.message : t.blog.uploadFailed,
      });
    }
  };

  const dismissUpload = (id: string) =>
    setUploads((list) => {
      const row = list.find((u) => u.id === id);
      if (row) URL.revokeObjectURL(row.preview);
      return list.filter((u) => u.id !== id);
    });

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) void uploadOne(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = useMutation({
    mutationFn: (image: BlogPostImage) =>
      browserFetch<{ deleted: boolean }>(`/blog/admin/posts/${postId}/images/${image.id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['blog-images', postId] });
    },
    onError: (problem) => {
      toast.error(problem instanceof Error ? problem.message : t.common.somethingWrong);
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Images className="text-primary size-4" aria-hidden /> {t.blog.mediaTitle}
          </CardTitle>
          <CardDescription>{t.blog.mediaHint}</CardDescription>
        </div>
        <div className="w-full sm:w-auto">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            onChange={(event) => onFiles(event.target.files)}
          />
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => inputRef.current?.click()}
          >
            <Upload aria-hidden /> {t.blog.mediaUpload}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {uploads.length > 0 && (
          <ul className="space-y-2">
            {uploads.map((u) => (
              <li
                key={u.id}
                className="border-border flex items-center gap-3 rounded-xl border p-2"
                aria-busy={!u.error}
              >
                <div className="bg-surface-2 relative size-14 shrink-0 overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                  <img src={u.preview} alt="" className="size-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  {u.error ? (
                    <p className="text-danger text-xs">{u.error}</p>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <div
                        className="bg-surface-2 h-1.5 flex-1 overflow-hidden rounded-full"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(u.progress * 100)}
                      >
                        <div
                          className="bg-primary h-full transition-[width]"
                          style={{ width: `${Math.round(u.progress * 100)}%` }}
                        />
                      </div>
                      <span className="text-muted flex items-center gap-1 text-xs">
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                        {u.progress >= 1 ? t.blog.uploading : `${Math.round(u.progress * 100)}%`}
                      </span>
                    </div>
                  )}
                </div>
                {u.error && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => dismissUpload(u.id)}
                  >
                    {t.admin.dismiss}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {images.isError && <Alert tone="danger">{t.common.somethingWrong}</Alert>}

        {images.data.length === 0 && uploads.length === 0 ? (
          <p className="text-muted text-sm">{t.blog.mediaEmpty}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {images.data.map((image) => (
              <li key={image.id}>
                <ImageRow image={image} onDelete={() => setPendingDelete(image)} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.blog.mediaDeleteTitle}</DialogTitle>
            <DialogDescription>{t.blog.mediaDeleteHint}</DialogDescription>
          </DialogHeader>
          {pendingDelete?.url && (
            <DialogBody>
              <div className="bg-surface-2 relative aspect-[16/9] w-full overflow-hidden rounded-xl">
                <LoadingImage
                  src={pendingDelete.url}
                  alt={pendingDelete.filename}
                  className="absolute inset-0 size-full object-contain"
                />
              </div>
              <p className="text-muted mt-2 truncate text-xs">{pendingDelete.filename}</p>
            </DialogBody>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={remove.isPending}
              onClick={() => pendingDelete && remove.mutate(pendingDelete)}
            >
              {remove.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Trash2 aria-hidden />
              )}
              {remove.isPending ? t.blog.mediaDeleting : t.blog.mediaDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface UploadState {
  id: string;
  name: string;
  preview: string;
  progress: number;
  error: string | null;
}

/**
 * One uploaded picture: preview, the address as text, and the two buttons that
 * matter. "Copy Markdown" pastes as a complete image line so the only thing
 * left to type is the description.
 */
function ImageRow({ image, onDelete }: { image: BlogPostImage; onDelete: () => void }) {
  const { t } = useI18n();
  const url = image.url ?? '';

  return (
    <div className="border-border flex gap-3 rounded-xl border p-2">
      <div className="bg-surface-2 relative size-20 shrink-0 overflow-hidden rounded-lg">
        <LoadingImage
          src={url}
          alt={image.filename}
          loading="lazy"
          spinner={false}
          className="absolute inset-0 size-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate text-sm font-medium" title={image.filename}>
          {image.filename}
        </p>
        <input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          aria-label={t.blog.mediaCopyUrl}
          className="bg-surface-2 text-muted w-full rounded-md px-2 py-1 font-mono text-[11px]"
        />
        <div className="flex flex-wrap gap-1.5">
          <CopyButton text={url} label={t.blog.mediaCopyUrl} copied={t.blog.mediaCopied} />
          <CopyButton
            text={`![${t.blog.fieldCoverAlt}](${url})`}
            label={t.blog.mediaCopyMarkdown}
            copied={t.blog.mediaCopied}
          />
          <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="text-danger" aria-hidden /> {t.blog.mediaDelete}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text, label, copied }: { text: string; label: string; copied: string }) {
  const { t } = useI18n();
  const [done, setDone] = React.useState(false);

  const copy = async () => {
    if (await copyText(text)) {
      setDone(true);
      toast.success(copied);
      window.setTimeout(() => setDone(false), 1500);
    } else {
      // Clipboard refused (insecure context, permissions): the address is still
      // in the field above, selectable by hand.
      toast.error(t.common.somethingWrong);
    }
  };

  return (
    <Button type="button" size="sm" variant="outline" onClick={copy}>
      {done ? <Check aria-hidden /> : <Copy aria-hidden />} {done ? copied : label}
    </Button>
  );
}

/**
 * The async clipboard API first; the old selection-and-copy second, which
 * needs no permission and still works where `navigator.clipboard` is absent
 * or refuses without a fresh user gesture. Never a blocking prompt.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'fixed';
    scratch.style.opacity = '0';
    document.body.appendChild(scratch);
    scratch.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    scratch.remove();
    return ok;
  }
}
