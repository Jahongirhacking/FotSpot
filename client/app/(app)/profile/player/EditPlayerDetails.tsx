'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { PlayerProfile } from '@/lib/api/types';
import { POSITIONS, UZBEK_REGIONS } from '@/lib/schemas/player';
import { useI18n } from '@/components/layout/I18nProvider';
import { PitchPositionPicker } from '@/components/player/PitchPositionPicker';
import { PlayingStylePicker } from '@/components/player/PlayingStylePicker';
import { positionGroup } from '@/lib/player-card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';

/**
 * The card details a player can change afterwards.
 *
 * The name is deliberately absent — it is what a scout recognises the player by,
 * so it goes through support rather than a form.
 *
 * Date of birth is editable, on the product's decision. It is worth naming what
 * that costs: it is an age gate as well as a detail (§11.1) — the card's age band,
 * the trial age checks and what counts as an under-18 account all read it — so a
 * player who edits it changes which trials will accept them. The server bounds it
 * to a plausible playing age and writes every change to the audit log, which does
 * not prevent the walk-around so much as make sure it left a trace.
 *
 * Every field is optional. A thin card still beats no card, and the completion
 * meter on the dashboard is what nudges the rest in.
 */
export function EditPlayerDetails({ player }: { player: PlayerProfile }) {
  const { t } = useI18n();
  const router = useRouter();

  const [form, setForm] = React.useState({
    // `<input type="date">` wants exactly YYYY-MM-DD; the API sends an ISO stamp.
    birthDate: player.birthDate ? player.birthDate.slice(0, 10) : '',
    primaryPosition: player.primaryPosition ?? '',
    secondaryPosition: player.secondaryPosition ?? '',
    dominantFoot: player.dominantFoot ?? '',
    playingStyle: player.playingStyle ?? '',
    region: player.region ?? '',
    district: player.district ?? '',
    height: player.height != null ? String(player.height) : '',
    weight: player.weight != null ? String(player.weight) : '',
  });
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      // Only what was filled in: sending '' for an untouched select would ask the
      // API to store an empty string where "not answered" is the truth.
      const body: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(form)) {
        if (value === '') continue;
        body[key] = key === 'height' || key === 'weight' ? Number(value) : value;
      }
      return browserFetch<PlayerProfile>('/players/me', { method: 'PATCH', body });
    },
    onSuccess: () => {
      setSaved(true);
      setError(null);
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(false);
        save.mutate();
      }}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">{t.profile.detailsSaved}</Alert>}

      <Field label={t.onboarding.dateOfBirth} htmlFor="birth-date" hint={t.profile.birthDateHint}>
        <Input
          id="birth-date"
          type="date"
          value={form.birthDate}
          onChange={(event) => set('birthDate')(event.target.value)}
        />
      </Field>

      {/*
        The same two controls the wizard uses, for the same reason.
        Somebody who picked their position on a pitch and their style from
        explained cards should not meet two dropdowns of jargon the first time
        they come back to change one — and a style chosen from a bare enum list
        here would undo the point of explaining it there.
      */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
        <PitchPositionPicker
          mode="single"
          label={t.onboarding.mainPosition}
          value={form.primaryPosition ? [form.primaryPosition] : []}
          onChange={(next) => set('primaryPosition')(next?.[0] ?? '')}
        />

        <div className="space-y-3">
          <Field
            label={t.onboarding.mainPosition}
            htmlFor="pos-1"
            hint={t.onboarding.positionPickHint}
          >
            <Select
              id="pos-1"
              value={form.primaryPosition}
              onChange={(event) => set('primaryPosition')(event.target.value)}
            >
              <option value="">{t.onboarding.notSureYet}</option>
              {POSITIONS.map((position) => (
                <option key={position} value={position}>
                  {position}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.onboarding.otherPosition} htmlFor="pos-2">
            <Select
              id="pos-2"
              value={form.secondaryPosition}
              onChange={(event) => set('secondaryPosition')(event.target.value)}
            >
              <option value="">{t.onboarding.notSureYet}</option>
              {POSITIONS.map((position) => (
                <option key={position} value={position}>
                  {position}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <Field label={t.onboarding.playingStyle} htmlFor="style" hint={t.onboarding.playingStyleHint}>
        <input type="hidden" id="style" value={form.playingStyle} readOnly />
        <PlayingStylePicker
          value={form.playingStyle}
          positionGroup={positionGroup(form.primaryPosition || null)}
          onChange={(next) => set('playingStyle')(next)}
        />
      </Field>

      <Field label={t.onboarding.strongFoot} htmlFor="foot">
        <Select
          id="foot"
          value={form.dominantFoot}
          onChange={(event) => set('dominantFoot')(event.target.value)}
        >
          <option value="">{t.onboarding.notSureYet}</option>
          <option value="RIGHT">{t.onboarding.right}</option>
          <option value="LEFT">{t.onboarding.left}</option>
          <option value="BOTH">{t.onboarding.both}</option>
        </Select>
      </Field>

      {/* The two that actually change season to season, which is the reason this
          form exists at all. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.onboarding.heightCm} htmlFor="height">
          <Input
            id="height"
            placeholder={t.placeholders.height}
            type="number"
            inputMode="numeric"
            min={80}
            max={230}
            value={form.height}
            onChange={(event) => set('height')(event.target.value)}
          />
        </Field>
        <Field label={t.onboarding.weightKg} htmlFor="weight">
          <Input
            id="weight"
            placeholder={t.placeholders.weight}
            type="number"
            inputMode="numeric"
            min={20}
            max={150}
            value={form.weight}
            onChange={(event) => set('weight')(event.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.onboarding.region} htmlFor="region">
          <Select
            id="region"
            value={form.region}
            onChange={(event) => set('region')(event.target.value)}
          >
            <option value="">{t.onboarding.notSureYet}</option>
            {UZBEK_REGIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.academy.district} htmlFor="district">
          <Input
            id="district"
            placeholder={t.placeholders.district}
            value={form.district}
            onChange={(event) => set('district')(event.target.value)}
          />
        </Field>
      </div>

      <Button type="submit" loading={save.isPending}>
        <Check aria-hidden /> {t.common.save}
      </Button>
    </form>
  );
}
