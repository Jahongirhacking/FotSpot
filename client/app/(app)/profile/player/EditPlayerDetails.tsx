'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { PlayerProfile } from '@/lib/api/types';
import { ALL_PLAYING_STYLES, POSITIONS, UZBEK_REGIONS } from '@/lib/schemas/player';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { humanizeEnum } from '@/lib/utils';

/**
 * The card details a player can change afterwards.
 *
 * Name and date of birth are deliberately absent. Height and weight change every
 * season and are meant to be kept current; a birth date that can be edited is an
 * age gate that can be walked around (§11.1), and the name on a player card is
 * what a scout recognises them by. Those go through support, not a form.
 *
 * Every field is optional. A thin card still beats no card, and the completion
 * meter on the dashboard is what nudges the rest in.
 */
export function EditPlayerDetails({ player }: { player: PlayerProfile }) {
  const { t } = useI18n();
  const router = useRouter();

  const [form, setForm] = React.useState({
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

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.onboarding.mainPosition} htmlFor="pos-1">
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

      <Field label={t.onboarding.playingStyle} htmlFor="style" hint={t.onboarding.playingStyleHint}>
        <Select
          id="style"
          value={form.playingStyle}
          onChange={(event) => set('playingStyle')(event.target.value)}
        >
          <option value="">{t.onboarding.pickLater}</option>
          {ALL_PLAYING_STYLES.map((style) => (
            <option key={style} value={style}>
              {humanizeEnum(style)}
            </option>
          ))}
        </Select>
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
