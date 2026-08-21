'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  GripVertical,
  ImagePlus,
  MapPin,
  Phone,
  Share2,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import { uploadToStorage } from '@/lib/api/upload';
import type { AcademyFeatured, AcademyMember, AcademyPhoto, AcademyProfile } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Alert, Skeleton } from '@/components/ui/Feedback';
import type { LatLng } from '@/components/academy/LocationPicker';
import { cn, initials } from '@/lib/utils';
import { yandexMapsUrl } from '@/lib/maps';
import { LoadingImage } from '@/components/ui/LoadingImage';

/**
 * Leaflet only exists on this screen.
 *
 * `ssr: false` because the library touches `window` at import time, and dynamic
 * because a player looking at their own card must not download a map to do it
 * (§14). The whole picker — library, CSS and tiles — is fetched the moment a
 * manager opens their own academy and at no other time.
 */
const LocationPicker = dynamic(
  () => import('@/components/academy/LocationPicker').then((mod) => mod.LocationPicker),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[320px] w-full rounded-xl" />,
  },
);

/** Which platforms may be linked. Mirrors the backend's host allowlist. */
const SOCIAL_FIELDS = ['telegramUrl', 'facebookUrl', 'instagramUrl', 'youtubeUrl'] as const;
type SocialField = (typeof SOCIAL_FIELDS)[number];

const FEATURED_ROLES = [
  { role: 'PLAYER', limit: 10, labelKey: 'featuredPlayers' },
  { role: 'COACH', limit: 5, labelKey: 'featuredCoaches' },
  { role: 'SCOUT', limit: 3, labelKey: 'featuredScouts' },
] as const;

/**
 * Everything a manager owns about how their academy presents itself.
 *
 * ## Sections save independently
 *
 * Contact, location, identity, links, photos and the featured lists are
 * unrelated decisions, and a single "save" across all of them means a manager
 * who dragged a pin has to think about whether their Instagram link is still
 * right. Each card commits its own change; nothing here is a wizard.
 *
 * ## Saving a form returns to preview; touching a collection does not
 *
 * The three field forms — contact, location, links — end on their save button,
 * so that is where the edit finishes and the manager is shown the result on the
 * profile itself. Photos and the featured lists have no save button at all:
 * adding a picture or dragging somebody up a list commits as you go, and bouncing
 * out to preview after each one would make building a gallery a loop of pressing
 * "Tahrirlash" again. Same rule stated once, applied where it fits.
 *
 * ## Only the manager sees it
 *
 * Rendered by the academy page when the viewer manages this academy *and* asked
 * to edit. The API refuses every one of these routes to anybody else, so this is
 * a matter of not showing controls that would 403 rather than the boundary
 * itself.
 */
export function AcademyProfileEditor({
  academy,
  members,
  backHref,
}: {
  academy: AcademyProfile;
  members: AcademyMember[];
  /** Preview mode — where "done" and every successful save lead back to. */
  backHref: string;
}) {
  const { t } = useI18n();
  const router = useRouter();

  /**
   * Leaving edit mode, with the saved data on screen.
   *
   * `replace` rather than `push` so that pressing back after saving does not
   * reopen the form the manager just finished with, and `refresh` because the
   * page they are returning to is a Server Component holding the values from
   * before the edit — without it they would land on the preview and see the old
   * phone number, which reads as the save having failed.
   */
  const toPreview = () => {
    router.replace(backHref);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* The way out, at the top where it is found without scrolling past five
          cards. Cancel is honest here: nothing on this screen is staged, so
          leaving discards only the fields nobody pressed save on. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t.academy?.editProfileTitle}</h2>
        <Button asChild variant="outline" size="sm">
          <Link href={backHref}>
            <X aria-hidden /> {t.common?.cancel}
          </Link>
        </Button>
      </div>

      <ContactCard academy={academy} onSaved={toPreview} />
      <IdentityCard academy={academy} />
      <LocationCard academy={academy} onSaved={toPreview} />
      <SocialCard academy={academy} onSaved={toPreview} />
      <PhotosCard academyId={academy?.id} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="text-primary size-4" aria-hidden /> {t.academy?.featuredLabel}
          </CardTitle>
          <p className="text-muted text-xs">{t.academy?.featuredHint}</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {FEATURED_ROLES.map((entry) => (
            <FeaturedList
              key={entry?.role}
              academyId={academy?.id}
              role={entry?.role}
              limit={entry?.limit}
              label={t.academy?.[entry?.labelKey]}
              members={members}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The two numbers a family rings.
 *
 * Both optional and both clearable: an academy with one line should not have to
 * invent a second, and one whose backup number was disconnected needs a way to
 * take it down. Emptying a box sends `''`, which the API stores as null — see
 * `UpdateAcademyDto`, where that distinction is spelled out.
 *
 * Sent together in one PATCH because they are one decision ("here is how to
 * reach us"), unlike the location and the links, which are not.
 */
function ContactCard({ academy, onSaved }: { academy: AcademyProfile; onSaved: () => void }) {
  const { t } = useI18n();

  const [form, setForm] = React.useState({
    primaryPhone: academy?.primaryPhone ?? '',
    backupPhone: academy?.backupPhone ?? '',
  });
  const [error, setError] = React.useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      browserFetch<AcademyProfile>(`/academies/${academy?.id}`, {
        method: 'PATCH',
        // Trimmed, because a trailing space is the difference between a valid
        // E.164 number and a 400 the manager cannot see the cause of.
        body: {
          primaryPhone: form?.primaryPhone?.trim(),
          backupPhone: form?.backupPhone?.trim(),
        },
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="text-primary size-4" aria-hidden /> {t.academy?.contactTitle}
        </CardTitle>
        <p className="text-muted text-xs">{t.academy?.contactHint}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.academy?.primaryPhone} htmlFor="primaryPhone">
            <Input
              id="primaryPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+998 90 123 45 67"
              value={form?.primaryPhone ?? ''}
              onChange={(event) =>
                setForm((current) => ({ ...current, primaryPhone: event.target.value }))
              }
            />
          </Field>

          <Field
            label={`${t.academy?.backupPhone} · ${t.common?.optional}`}
            htmlFor="backupPhone"
            hint={t.academy?.backupPhoneHint}
          >
            <Input
              id="backupPhone"
              type="tel"
              inputMode="tel"
              placeholder="+998 91 234 56 78"
              value={form?.backupPhone ?? ''}
              onChange={(event) =>
                setForm((current) => ({ ...current, backupPhone: event.target.value }))
              }
            />
          </Field>
        </div>

        <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
          <Check aria-hidden /> {t.common.save}
        </Button>
      </CardContent>
    </Card>
  );
}

/** The logo — the one image that identifies the academy everywhere else. */
function IdentityCard({ academy }: { academy: AcademyProfile }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const ticket = await browserFetch<{ uploadUrl: string; storageKey: string }>(
        `/academies/${academy?.id}/images/upload-url`,
        { method: 'POST', body: { filename: file?.name || 'logo.jpg' } },
      );
      await uploadToStorage(ticket?.uploadUrl, file, {
        blocked: t.clips.uploadBlocked,
        rejected: t.clips.uploadFailed,
      });
      return browserFetch<AcademyProfile>(`/academies/${academy?.id}`, {
        method: 'PATCH',
        body: { logoKey: ticket?.storageKey },
      });
    },
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t.academy?.logoLabel}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex items-center gap-4">
          <Avatar
            src={academy?.logoUrl}
            fallback={initials(academy?.name?.split(' ')?.[0], academy?.name?.split(' ')?.[1])}
            className="size-16 text-lg"
          />
          <label className="inline-block">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                if (chosen) upload.mutate(chosen);
              }}
            />
            <span
              className={cn(
                'border-border hover:bg-surface-2 inline-flex cursor-pointer items-center gap-1.5',
                'rounded-lg border px-3 py-2 text-sm font-medium',
                upload.isPending && 'pointer-events-none opacity-60',
              )}
            >
              <ImagePlus className="size-4" aria-hidden /> {t.common.edit}
            </span>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Where the academy is. Saved explicitly, so a stray tap is not a change.
 *
 * ## The same map, told what it is for
 *
 * The picker itself is unchanged — OpenStreetMap tiles, drag or tap or use my
 * location. What was missing around it was any statement of what the pin means
 * and whether the one on screen is the stored one: a manager who tapped the map
 * and wandered off left a card that looked identical to a saved change. So the
 * heading says what the point answers, the coordinates are labelled saved or
 * unsaved, and there is a way back to the stored point that does not involve
 * remembering where it was.
 */
function LocationCard({ academy, onSaved }: { academy: AcademyProfile; onSaved: () => void }) {
  const { t } = useI18n();

  const saved: LatLng | null =
    academy?.latitude != null && academy?.longitude != null
      ? { latitude: academy?.latitude, longitude: academy?.longitude }
      : null;

  const [draft, setDraft] = React.useState<LatLng | null>(saved);
  const [error, setError] = React.useState<string | null>(null);

  const save = useMutation({
    mutationFn: (next: LatLng) =>
      browserFetch<AcademyProfile>(`/academies/${academy?.id}`, {
        method: 'PATCH',
        body: { latitude: next?.latitude, longitude: next?.longitude },
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (err: Error) => setError(err.message),
  });

  const moved =
    draft && (draft.latitude !== saved?.latitude || draft.longitude !== saved?.longitude);

  const savedHref = saved ? yandexMapsUrl({ ...saved, address: academy?.name }) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="text-primary size-4" aria-hidden /> {t.academy?.locationLabel}
        </CardTitle>
        <p className="text-muted text-xs">{t.academy?.locationHint}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}

        {/* What is stored right now, before any of this session's dragging.
            An academy that has never set a point says so plainly — the map
            centred on Tashkent otherwise reads as "we are in Tashkent". */}
        <div className="border-border bg-surface-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs">
          <span className="text-muted">{t.academy?.currentLocation}</span>
          {saved ? (
            <>
              <span className="font-mono">
                {saved?.latitude?.toFixed(5)}, {saved?.longitude?.toFixed(5)}
              </span>
              {savedHref && (
                <a
                  href={savedHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {t.academy?.openInMaps}
                </a>
              )}
            </>
          ) : (
            <span className="font-medium">{t.academy?.noLocationYet}</span>
          )}
        </div>

        <LocationPicker value={draft} onChange={setDraft} />

        {/* Only while there is something to save, so the card is quiet until the
            manager has actually changed the answer. */}
        {moved && (
          <p className="text-warning text-xs">
            {t.academy?.unsavedLocation?.replace(
              '{coords}',
              `${draft?.latitude?.toFixed(5)}, ${draft?.longitude?.toFixed(5)}`,
            )}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!moved}
            loading={save.isPending}
            onClick={() => draft && save.mutate(draft)}
          >
            <Check aria-hidden /> {t.common.save}
          </Button>

          {moved && (
            <Button size="sm" variant="ghost" onClick={() => setDraft(saved)}>
              {t.academy?.revertLocation}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** The four allowed platforms. Hosts are validated server-side. */
function SocialCard({ academy, onSaved }: { academy: AcademyProfile; onSaved: () => void }) {
  const { t } = useI18n();

  const [form, setForm] = React.useState<Record<SocialField, string>>(() => ({
    telegramUrl: academy?.telegramUrl ?? '',
    facebookUrl: academy?.facebookUrl ?? '',
    instagramUrl: academy?.instagramUrl ?? '',
    youtubeUrl: academy?.youtubeUrl ?? '',
  }));
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const save = useMutation({
    mutationFn: () =>
      browserFetch<AcademyProfile>(`/academies/${academy?.id}`, { method: 'PATCH', body: form }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      onSaved();
    },
    onError: (err: Error) => {
      setSaved(false);
      setError(err.message);
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Share2 className="text-primary size-4" aria-hidden /> {t.academy?.socialsLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {saved && !error && <Alert tone="success">{t.plans?.saved}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL_FIELDS.map((field) => (
            <Field key={field} label={labelFor(field)} htmlFor={field}>
              <Input
                id={field}
                inputMode="url"
                placeholder={placeholderFor(field)}
                value={form?.[field] ?? ''}
                onChange={(event) => {
                  setSaved(false);
                  setForm((current) => ({ ...current, [field]: event.target.value }));
                }}
              />
            </Field>
          ))}
        </div>

        <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
          <Check aria-hidden /> {t.common.save}
        </Button>
      </CardContent>
    </Card>
  );
}

/** The gallery. First photo is the cover, which is why order is editable. */
function PhotosCard({ academyId }: { academyId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const { data: photos } = useQuery({
    queryKey: ['academy-photos', academyId],
    queryFn: () => browserFetch<AcademyPhoto[]>(`/academies/${academyId}/photos`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['academy-photos', academyId] });

  const add = useMutation({
    mutationFn: async (file: File) => {
      const ticket = await browserFetch<{ uploadUrl: string; storageKey: string }>(
        `/academies/${academyId}/images/upload-url`,
        { method: 'POST', body: { filename: file?.name || 'photo?.jpg' } },
      );
      await uploadToStorage(ticket?.uploadUrl, file, {
        blocked: t.clips.uploadBlocked,
        rejected: t.clips.uploadFailed,
      });
      return browserFetch<AcademyPhoto>(`/academies/${academyId}/photos`, {
        method: 'POST',
        body: { storageKey: ticket?.storageKey },
      });
    },
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (photoId: string) =>
      browserFetch(`/academies/photos/${photoId}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      browserFetch(`/academies/${academyId}/photos/order`, { method: 'PATCH', body: { ids } }),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const list = photos ?? [];

  /** Buttons rather than drag handles: one tap works on a phone, drag does not. */
  const move = (index: number, direction: -1 | 1) => {
    const next = [...list];
    const target = index + direction;
    if (target < 0 || target >= next?.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next?.map((photo) => photo?.id));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t.academy?.photosLabel}</CardTitle>
        <p className="text-muted text-xs">{t.academy?.photosHint}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}

        {list.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {list.map((photo, index) => (
              <li key={photo?.id} className="group relative">
                { }
                <LoadingImage
                  src={photo?.url ?? ''}
                  alt={photo?.caption ?? ''}
                  loading="lazy"
                  spinner={false}
                  className="bg-surface-3 aspect-video w-full rounded-lg object-cover"
                />
                {index === 0 && (
                  <Badge variant="primary" className="absolute top-1.5 left-1.5">
                    {t.common.open}
                  </Badge>
                )}
                <div className="absolute right-1.5 bottom-1.5 flex gap-1">
                  <IconButton label="←" onClick={() => move(index, -1)} disabled={index === 0} />
                  <IconButton
                    label="→"
                    onClick={() => move(index, 1)}
                    disabled={index === list.length - 1}
                  />
                  <IconButton
                    label={<Trash2 className="size-3.5" aria-hidden />}
                    onClick={() => remove.mutate(photo?.id)}
                    danger
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <label className="inline-block">
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) add.mutate(chosen);
            }}
          />
          <span
            className={cn(
              'border-border hover:bg-surface-2 inline-flex cursor-pointer items-center gap-1.5',
              'rounded-lg border px-3 py-2 text-sm font-medium',
              add.isPending && 'pointer-events-none opacity-60',
            )}
          >
            <ImagePlus className="size-4" aria-hidden /> {t.academy?.addPhoto}
          </span>
        </label>
      </CardContent>
    </Card>
  );
}

/**
 * One featured list — the top players, coaches or scouts.
 *
 * Picked from this academy's own squad, so there is nothing to search and no way
 * to name somebody who does not work here. Order is the array order, which is
 * why the arrows and not a sort: the manager is arranging a wall, not filtering.
 */
function FeaturedList({
  academyId,
  role,
  limit,
  label,
  members,
}: {
  academyId: string;
  role: 'PLAYER' | 'COACH' | 'SCOUT';
  limit: number;
  label: string;
  members: AcademyMember[];
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const { data: featured } = useQuery({
    queryKey: ['academy-featured', academyId],
    queryFn: () => browserFetch<AcademyFeatured[]>(`/academies/${academyId}/featured`),
  });

  const mine = (featured ?? []).filter((entry) => entry?.role === role);
  const chosen = mine.map((entry) => entry?.memberId);

  const eligible = (members ?? []).filter(
    (member) => member?.role === role && member?.status !== 'RELEASED',
  );

  const save = useMutation({
    mutationFn: (memberIds: string[]) =>
      browserFetch(`/academies/${academyId}/featured`, {
        method: 'PUT',
        body: { role, memberIds },
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['academy-featured', academyId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const toggle = (memberId: string) => {
    const next = chosen?.includes(memberId)
      ? chosen?.filter((id) => id !== memberId)
      : [...chosen, memberId];
    if (next?.length > limit) return;
    save.mutate(next);
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...chosen];
    const target = index + direction;
    if (target < 0 || target >= next?.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    save.mutate(next);
  };

  const full = chosen?.length >= limit;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className={cn('text-xs', full ? 'text-warning' : 'text-muted')}>
          {chosen?.length} / {limit}
          {full && ` · ${t.academy?.featuredFull}`}
        </span>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {/* The wall, in order. */}
      {mine.length > 0 && (
        <ol className="space-y-1.5">
          {mine.map((entry, index) => (
            <li
              key={entry?.memberId}
              className="border-border flex items-center gap-2 rounded-lg border p-2"
            >
              <GripVertical className="text-muted size-4 shrink-0" aria-hidden />
              <span className="text-muted w-4 text-xs tabular-nums">{index + 1}</span>
              <Avatar
                src={entry?.avatarUrl}
                fallback={initials(entry?.firstName, entry?.lastName)}
                className="size-7"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {[entry?.firstName, entry?.lastName].filter(Boolean).join(' ') || '—'}
              </span>
              <IconButton label="↑" onClick={() => move(index, -1)} disabled={index === 0} />
              <IconButton
                label="↓"
                onClick={() => move(index, 1)}
                disabled={index === mine.length - 1}
              />
              <IconButton
                label={<Trash2 className="size-3.5" aria-hidden />}
                onClick={() => toggle(entry?.memberId)}
                danger
              />
            </li>
          ))}
        </ol>
      )}

      {/* Everybody eligible, so adding is one tap from the same place. */}
      <div className="flex flex-wrap gap-1.5">
        {eligible
          .filter((member) => !chosen?.includes(member?.id))
          .map((member) => (
            <button
              key={member?.id}
              type="button"
              disabled={full || save.isPending}
              onClick={() => toggle(member?.id)}
              className={cn(
                'border-border inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                'hover:border-primary/60 transition-colors',
                (full || save.isPending) && 'cursor-not-allowed opacity-40',
              )}
            >
              {[member?.firstName, member?.lastName].filter(Boolean).join(' ') ||
                member?.username ||
                '—'}
            </button>
          ))}
      </div>
    </section>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-md border text-xs',
        'border-border bg-surface hover:bg-surface-2 transition-colors',
        danger && 'text-danger hover:border-danger/50',
        disabled && 'cursor-not-allowed opacity-30',
      )}
    >
      {label}
    </button>
  );
}

function labelFor(field: SocialField): string {
  return field.replace(/Url$/, '').replace(/^./, (char) => char.toUpperCase());
}

function placeholderFor(field: SocialField): string {
  const hosts: Record<SocialField, string> = {
    telegramUrl: 'https://t.me/…',
    facebookUrl: 'https://facebook.com/…',
    instagramUrl: 'https://instagram.com/…',
    youtubeUrl: 'https://youtube.com/@…',
  };
  return hosts?.[field] ?? '';
}
