'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, Check } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import { uploadToStorage } from '@/lib/api/upload';
import type { AvatarUploadUrl } from '@/lib/api/resources';
import { useI18n } from '@/components/layout/I18nProvider';
import { initials } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';

const schema = z.object({
  firstName: z.string().trim().max(60),
  lastName: z.string().trim().max(60),
  /**
   * Mirrors `username.util.ts` on the API so the obvious mistakes are caught
   * before a round trip. Uniqueness is deliberately not mirrored — only the
   * database can answer that, and only at the moment of writing.
   */
  username: z
    .string()
    .trim()
    .transform((value) => value?.replace(/^@+/, '').toLowerCase())
    .refine((value) => value?.length >= 3, 'At least 3 characters')
    .refine((value) => value?.length <= 30, 'At most 30 characters')
    .refine(
      (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
      'Lowercase letters, numbers and single hyphens only',
    ),
});
type Values = z.infer<typeof schema>;

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function EditIdentity({
  initial,
}: {
  initial: { firstName: string; lastName: string; username: string; avatarUrl: string | null };
}) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInput = React.useRef<HTMLInputElement>(null);

  const [avatarUrl, setAvatarUrl] = React.useState(initial.avatarUrl);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [avatarNotice, setAvatarNotice] = React.useState<string | null>(null);
  const [avatarError, setAvatarError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: initial.firstName,
      lastName: initial.lastName,
      username: initial.username,
    },
  });

  const watched = form.watch();

  async function onSubmit(values: Values) {
    setError(null);
    setSaved(false);
    try {
      await browserFetch('/users/me', { method: 'PATCH', body: values });
      setSaved(true);
      router.refresh();

      /*
       * Go back to whatever sent us here, when something did.
       *
       * The onboarding wizard links in to correct a name — most often one Google
       * filled in — and without this the reader saves, is left on the settings
       * page, and has to find their way back to a wizard that has forgotten
       * which step they were on. `next` is what makes the link a detour rather
       * than an exit.
       *
       * Only a same-origin path is honoured. `next` is in the URL and therefore
       * anybody's to write, and a redirect that accepts `//evil.example` is an
       * open redirect — the leading-slash pair is exactly the case a naive
       * `startsWith('/')` misses.
       */
      const next = searchParams.get('next');
      if (next && next.startsWith('/') && !next.startsWith('//')) router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.somethingWrong);
    }
  }

  /**
   * Ask the API for a presigned PUT, then upload straight to storage.
   *
   * R2 credentials are a documented stub, so the API reports whether storage is
   * actually configured. When it isn't we show a local preview and say plainly
   * that the picture won't persist — better than a spinner that appears to
   * succeed and loses the file.
   */
  async function onPickAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setAvatarError(null);
    setAvatarNotice(null);

    if (!file.type.startsWith('image/')) {
      setAvatarError(t.profile.avatarMustBeImage);
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError(t.profile.avatarTooLarge);
      return;
    }

    setPreview(URL.createObjectURL(file));
    setUploading(true);

    try {
      const ticket = await browserFetch<AvatarUploadUrl>('/users/me/avatar/upload-url', {
        method: 'POST',
        body: { filename: file.name },
      });

      // No `storageConfigured` check any more: the API refuses with 503 and a
      // reason when R2 is unset, so there is nothing to guess at here — and the
      // flag it used to read no longer exists, which silently killed every
      // avatar upload until this was fixed.
      await uploadToStorage(ticket.uploadUrl, file, {
        blocked: t.clips.uploadBlocked,
        rejected: t.profile.avatarUploadFailed,
      });

      await browserFetch('/users/me', {
        method: 'PATCH',
        body: { avatarStorageKey: ticket.storageKey },
      });

      setAvatarUrl(ticket.publicUrl);
      router.refresh();
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : t.profile.avatarUploadFailed);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.profile.identity}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar
            src={preview ?? avatarUrl}
            fallback={initials(watched.firstName, watched.lastName)}
            className="size-20 text-2xl"
            alt=""
          />
          <div className="space-y-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={uploading}
              onClick={() => fileInput.current?.click()}
            >
              <Camera aria-hidden /> {t.profile.changePhoto}
            </Button>
            <p className="text-muted text-xs">{t.profile.avatarHint}</p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onPickAvatar}
            aria-label={t.profile.changePhoto}
          />
        </div>

        {avatarError && <Alert tone="danger">{avatarError}</Alert>}
        {avatarNotice && <Alert tone="warning">{avatarNotice}</Alert>}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}

          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t.auth.firstName}
              htmlFor="firstName"
              error={form.formState.errors.firstName?.message}
            >
              <Input
                id="firstName"
                autoComplete="given-name"
                {...form.register('firstName')}
                placeholder={t.placeholders.firstName}
              />
            </Field>
            <Field
              label={t.auth.lastName}
              htmlFor="lastName"
              error={form.formState.errors.lastName?.message}
            >
              <Input
                id="lastName"
                autoComplete="family-name"
                {...form.register('lastName')}
                placeholder={t.placeholders.lastName}
              />
            </Field>
          </div>

          {/* The handle is the one field here that is public and addressable:
              it is what `/players/@handle` resolves and what people type to find
              this account again. */}
          <Field
            label={t.profile.username}
            htmlFor="username"
            hint={t.profile.usernameHint}
            error={form.formState.errors.username?.message}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-muted font-mono text-sm">@</span>
              <Input
                id="username"
                placeholder={t.placeholders.username}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                {...form.register('username')}
              />
            </div>
          </Field>

          <Button type="submit" loading={form.formState.isSubmitting}>
            {saved ? <Check aria-hidden /> : null}
            {saved ? t.profile.saved : t.common.save}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
