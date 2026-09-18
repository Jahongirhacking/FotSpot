'use client';

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
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { LoadingImage } from '@/components/ui/LoadingImage';
import { browserFetch } from '@/lib/api/browser';
import type { Page } from '@/lib/api/client';
import { uploadToStorage } from '@/lib/api/upload';
import type {
  AcademyProfile,
  DominantFoot,
  ProfessionalPlayer,
  SaveProfessionalPlayerBody,
} from '@/lib/api/types';
import { footLabel, fullName } from '@/lib/professional-players';
import { POSITIONS } from '@/lib/schemas/player';
import { cn, initials } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ImagePlus, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

const QUERY_KEY = ['admin-professional-players'];
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const FEET: DominantFoot[] = ['RIGHT', 'LEFT', 'BOTH'];

/**
 * The admin's list of professionals, with one dialog for adding and editing.
 *
 * The record is saved first and the portrait second: the upload ticket is
 * minted under the player's own id, so a brand-new player has to exist before
 * a photo can be filed under them. The dialog shows this as one Save.
 */
export function ProfessionalPlayerManager({ initial }: { initial: ProfessionalPlayer[] }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<ProfessionalPlayer | 'new' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const list = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () =>
      browserFetch<Page<ProfessionalPlayer>>('/professional-players?pageSize=100').then(
        (page) => page.items,
      ),
    initialData: initial,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['professional-players'] });
  };

  const remove = useMutation({
    mutationFn: (id: string) => browserFetch(`/professional-players/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t.professional.deleted);
      refresh();
    },
    onError: (problem: Error) => setError(problem.message),
  });

  const players = list.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus aria-hidden /> {t.professional.add}
        </Button>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {list.isError && <Alert tone="danger">{t.common.couldNotLoad}</Alert>}

      {players.length === 0 ? (
        <EmptyState
          icon={Star}
          title={t.professional.empty}
          description={t.professional.emptyHint}
        />
      ) : (
        <Card>
          <CardContent className="p-2">
            <ul className="divide-border divide-y">
              {players.map((player) => (
                <li key={player.id} className="flex items-center gap-3 px-2 py-3">
                  <Avatar
                    src={player.avatarUrl}
                    fallback={initials(player.firstName, player.lastName)}
                    className="size-10 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{fullName(player)}</p>
                    <p className="text-muted truncate text-xs">
                      {[player.position, footLabel(player.dominantFoot, t)]
                        .filter(Boolean)
                        .join(' · ') || t.professional.notSet}
                      {player.academies.length > 0 && (
                        <>
                          {' · '}
                          {player.academies.map((academy) => academy.name).join(', ')}
                        </>
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t.professional.edit}
                    onClick={() => setEditing(player)}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t.professional.delete}
                    disabled={remove.isPending && remove.variables === player.id}
                    onClick={() => {
                      if (window.confirm(t.professional.confirmDelete)) remove.mutate(player.id);
                    }}
                  >
                    <Trash2 className="text-danger" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {editing && (
        <ProfessionalPlayerFormDialog
          player={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            toast.success(t.professional.saved);
            refresh();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ProfessionalPlayerFormDialog({
  player,
  onClose,
  onSaved,
}: {
  player: ProfessionalPlayer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [firstName, setFirstName] = React.useState(player?.firstName ?? '');
  const [lastName, setLastName] = React.useState(player?.lastName ?? '');
  const [position, setPosition] = React.useState(player?.position ?? '');
  const [foot, setFoot] = React.useState<DominantFoot | ''>(player?.dominantFoot ?? '');
  const [academyIds, setAcademyIds] = React.useState<string[]>(
    player?.academies.map((academy) => academy.id) ?? [],
  );
  const [academySearch, setAcademySearch] = React.useState('');
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  // Every academy, so a tick list can be filtered locally — there are tens
  // of them, not thousands, and the public list is what the API offers.
  const academies = useQuery({
    queryKey: ['academies', 'public'],
    queryFn: () => browserFetch<AcademyProfile[]>('/academies'),
  });

  React.useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  });

  const save = useMutation({
    mutationFn: async () => {
      const body: SaveProfessionalPlayerBody = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        position: position,
        dominantFoot: foot || null,
        academyIds,
      };
      const saved = player
        ? await browserFetch<ProfessionalPlayer>(`/professional-players/${player.id}`, {
            method: 'PATCH',
            body,
          })
        : await browserFetch<ProfessionalPlayer>('/professional-players', {
            method: 'POST',
            body,
          });

      if (photo) {
        const ticket = await browserFetch<{ uploadUrl: string; storageKey: string }>(
          `/professional-players/${saved.id}/avatar/upload-url`,
          {
            method: 'POST',
            body: { filename: photo.name || 'photo.jpg', contentType: photo.type },
          },
        );
        await uploadToStorage(ticket.uploadUrl, photo, {
          blocked: t.clips.uploadBlocked,
          rejected: t.clips.uploadFailed,
        });
        await browserFetch(`/professional-players/${saved.id}`, {
          method: 'PATCH',
          body: { avatarKey: ticket.storageKey },
        });
      }
    },
    onSuccess: onSaved,
    onError: (problem: Error) => setError(problem.message),
  });

  function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t.professional.photoType);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError(t.professional.photoTooLarge);
      return;
    }
    setError(null);
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  const toggleAcademy = (id: string) =>
    setAcademyIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );

  const needle = academySearch.trim().toLowerCase();
  const academyOptions = (academies.data ?? []).filter(
    (academy) => !needle || academy.name.toLowerCase().includes(needle),
  );
  const ready = firstName.trim().length > 0 && lastName.trim().length > 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{player ? t.professional.edit : t.professional.add}</DialogTitle>
          <DialogDescription>{t.professional.manageHint}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}

          <div className="flex items-center gap-4">
            {preview ? (
              <LoadingImage
                src={preview}
                alt=""
                spinner={false}
                className="size-20 shrink-0 rounded-full object-cover"
              />
            ) : (
              <Avatar
                src={player?.avatarUrl ?? null}
                fallback={initials(firstName, lastName) || '?'}
                className="size-20 shrink-0 text-xl"
              />
            )}
            <div className="space-y-1">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => pickPhoto(event.target.files?.[0])}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus aria-hidden /> {t.professional.changePhoto}
              </Button>
              <p className="text-muted text-xs">{t.professional.photoHint}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.professional.firstName} htmlFor="pro-first" required>
              <Input
                id="pro-first"
                value={firstName}
                maxLength={80}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </Field>
            <Field label={t.professional.lastName} htmlFor="pro-last" required>
              <Input
                id="pro-last"
                value={lastName}
                maxLength={80}
                onChange={(event) => setLastName(event.target.value)}
              />
            </Field>
            <Field label={t.professional.position} htmlFor="pro-position">
              <Select
                id="pro-position"
                value={position}
                onChange={(event) => setPosition(event.target.value)}
              >
                <option value="">{t.professional.notSet}</option>
                {POSITIONS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.professional.dominantFoot} htmlFor="pro-foot">
              <Select
                id="pro-foot"
                value={foot}
                onChange={(event) => setFoot(event.target.value as DominantFoot | '')}
              >
                <option value="">{t.professional.notSet}</option>
                {FEET.map((value) => (
                  <option key={value} value={value}>
                    {footLabel(value, t)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label={t.professional.academies}
            htmlFor="pro-academy-search"
            hint={t.professional.academiesHint}
          >
            <Input
              id="pro-academy-search"
              value={academySearch}
              onChange={(event) => setAcademySearch(event.target.value)}
              placeholder={t.professional.searchAcademies}
            />
          </Field>
          <div className="border-border max-h-48 overflow-y-auto rounded-lg border">
            {academies.isLoading ? (
              <p className="text-muted p-3 text-sm">{t.common.loading}</p>
            ) : academyOptions.length === 0 ? (
              <p className="text-muted p-3 text-sm">{t.academy.noCandidates}</p>
            ) : (
              academyOptions.map((academy) => {
                const checked = academyIds.includes(academy.id);
                return (
                  <label
                    key={academy.id}
                    className={cn(
                      'hover:bg-surface-2 flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm',
                      checked && 'bg-primary/10',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAcademy(academy.id)}
                      className="accent-primary size-4"
                    />
                    <LoadingImage
                      src={academy.logoUrl}
                      alt=""
                      spinner={false}
                      className="size-7 shrink-0 rounded object-cover"
                      fallback={<Building2 className="text-muted size-4 shrink-0" aria-hidden />}
                    />
                    <span className="min-w-0 flex-1 truncate">{academy.name}</span>
                    {academy.kind === 'LOCAL_TEAM' && (
                      <Badge variant="neutral">{t.academy.localTeam}</Badge>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            {t.common.cancel}
          </Button>
          <Button loading={save.isPending} disabled={!ready} onClick={() => save.mutate()}>
            {t.professional.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
