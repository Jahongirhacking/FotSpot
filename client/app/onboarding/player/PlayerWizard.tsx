'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Check } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import { refreshSession, setActiveRoleCookie } from '@/lib/api/session-refresh';
import { useI18n } from '@/components/layout/I18nProvider';
import {
  PLAYING_STYLES,
  POSITIONS,
  UZBEK_REGIONS,
  playerFootballSchema,
  playerIdentitySchema,
  type PlayerFootballInput,
  type PlayerFootballValues,
  type PlayerIdentityValues,
} from '@/lib/schemas/player';
import type { PlayerProfile } from '@/lib/api/types';
import { cn, humanizeEnum } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input, Label, Select } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';

/**
 * Two steps, not three.
 *
 * There used to be a guardian gate between them for under-18s. It collected an
 * acknowledgement checkbox and nothing else — no guardian account, no consent
 * record, no change to who could see the profile — so it asked a child to promise
 * something the product could not act on, and implied a safeguard that did not
 * exist. README §11 still calls for real guardian consent before launch; removing
 * this placeholder does not satisfy that, it stops pretending to.
 */
type Step = 'identity' | 'football';

/**
 * Player profile wizard.
 *
 * Date of birth comes first and alone, because it decides the age band every
 * number on the card is compared within (§21.1) — "fast" is meaningless until you
 * know "fast for what age". Everything optional comes after, so a half-finished
 * card is still a card.
 */
export function PlayerWizard({
  knownName,
}: {
  knownName: { firstName: string; lastName: string };
}) {
  const [step, setStep] = React.useState<Step>('identity');
  const [identity, setIdentity] = React.useState<PlayerIdentityValues | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);


  return (
    <div className="space-y-4">
      <Steps current={step} />

      {serverError && <Alert tone="danger">{serverError}</Alert>}

      {step === 'identity' && (
        <IdentityStep
          knownName={knownName}
          defaults={identity}
          onDone={(values) => {
            setIdentity(values);
            setStep('football');
          }}
        />
      )}


      {step === 'football' && identity && (
        <FootballStep
          identity={identity}
          onBack={() => setStep('identity')}
          onError={setServerError}
        />
      )}
    </div>
  );
}

function Steps({ current }: { current: Step }) {
  const { t } = useI18n();
  const steps: { key: Step; label: string }[] = [
    { key: 'identity', label: 'You' },
    { key: 'football', label: 'Football' },
  ];
  const index = steps.findIndex((step) => step.key === current);

  return (
    <ol className="flex items-center gap-2" aria-label={t.onboarding.progress}>
      {steps.map((step, position) => (
        <li key={step.key} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
              position < index && 'bg-primary text-primary-foreground',
              position === index && 'bg-primary/15 text-primary ring-primary/40 ring-2',
              position > index && 'bg-surface-3 text-muted',
            )}
          >
            {position < index ? <Check className="size-3.5" aria-hidden /> : position + 1}
          </span>
          <span
            className={cn(
              'text-xs font-medium',
              position === index ? 'text-foreground' : 'text-muted',
            )}
          >
            {step.label}
          </span>
          {position < steps.length - 1 && <span className="bg-border h-px flex-1" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function IdentityStep({
  knownName,
  defaults,
  onDone,
}: {
  knownName: { firstName: string; lastName: string };
  defaults: PlayerIdentityValues | null;
  onDone: (values: PlayerIdentityValues) => void;
}) {
  const { t } = useI18n();

  // If the account already has a name, don't ask for it again — show it, with a
  // link to change it in one place (the profile) rather than duplicating the field
  // here and letting the two drift apart.
  const nameIsKnown = Boolean(knownName.firstName.trim() && knownName.lastName.trim());

  const form = useForm<PlayerIdentityValues>({
    resolver: zodResolver(playerIdentitySchema),
    defaultValues: defaults ?? {
      firstName: knownName.firstName,
      lastName: knownName.lastName,
      birthDate: '',
      gender: 'male',
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.onboarding.whoIsPlaying}</CardTitle>
        <CardDescription>
          Just the basics for now. Your date of birth decides which age group you&apos;re compared
          in — we never compare across age groups.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onDone)} className="space-y-4" noValidate>
          {nameIsKnown ? (
            <div className="border-border bg-surface-2 flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-muted text-xs">
                  {t.auth.firstName} · {t.auth.lastName}
                </p>
                <p className="truncate font-medium">
                  {knownName.firstName} {knownName.lastName}
                </p>
              </div>
              <Link
                href="/profile/edit"
                className="text-primary shrink-0 text-xs font-medium hover:underline"
              >
                {t.profile.editProfile}
              </Link>
              <input type="hidden" {...form.register('firstName')} />
              <input type="hidden" {...form.register('lastName')} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t.auth.firstName}
                htmlFor="firstName"
                required
                error={form.formState.errors.firstName?.message}
              >
                <Input id="firstName" {...form.register('firstName')} />
              </Field>
              <Field
                label={t.auth.lastName}
                htmlFor="lastName"
                required
                error={form.formState.errors.lastName?.message}
              >
                <Input id="lastName" {...form.register('lastName')} />
              </Field>
            </div>
          )}

          <Field
            label={t.onboarding.dateOfBirth}
            htmlFor="birthDate"
            required
            error={form.formState.errors.birthDate?.message}
          >
            <Input id="birthDate" type="date" {...form.register('birthDate')} />
          </Field>

          <Field
            label={t.onboarding.gender}
            htmlFor="gender"
            required
            error={form.formState.errors.gender?.message}
          >
            <Select id="gender" {...form.register('gender')}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          </Field>

          <Button type="submit" className="w-full">
            Continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FootballStep({
  identity,
  onBack,
  onError,
}: {
  identity: PlayerIdentityValues;
  onBack: () => void;
  onError: (message: string | null) => void;
}) {
  const { t } = useI18n();
  // Input/output types differ because of z.coerce — see lib/schemas/player.ts.
  const form = useForm<PlayerFootballInput, unknown, PlayerFootballValues>({
    resolver: zodResolver(playerFootballSchema),
    defaultValues: { region: UZBEK_REGIONS[0] },
  });

  // useWatch, not form.watch: watch() returns a fresh function each render, which
  // opts the whole component out of React Compiler memoization.
  const primaryPosition = useWatch({ control: form.control, name: 'primaryPosition' });

  async function onSubmit(values: PlayerFootballValues) {
    onError(null);
    try {
      await browserFetch<PlayerProfile>('/players/me', {
        method: 'POST',
        body: {
          ...identity,
          ...stripEmpty(values),
          birthDate: new Date(identity.birthDate).toISOString(),
        },
      });

      // Creating the profile granted the `player` role server-side, but the
      // current token still claims only the roles held at login. Without this the
      // new role is missing from the switcher until the user signs out and back
      // in — which is exactly the bug this fixes.
      await refreshSession();
      await setActiveRoleCookie('player');

      // Land on the card they just created — that is the payoff (§21.6: the card is
      // the player's home screen).
      window.location.assign('/dashboard');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not create your profile.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.onboarding.yourGame}</CardTitle>
        <CardDescription>
          All optional — you can fill these in later. Every one you add makes your card stronger.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.onboarding.mainPosition} htmlFor="primaryPosition">
              <Select id="primaryPosition" {...form.register('primaryPosition')}>
                <option value="">{t.onboarding.notSureYet}</option>
                {POSITIONS.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.onboarding.otherPosition} htmlFor="secondaryPosition">
              <Select id="secondaryPosition" {...form.register('secondaryPosition')}>
                <option value="">—</option>
                {POSITIONS.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label={t.onboarding.playingStyle}
            htmlFor="playingStyle"
            hint={t.onboarding.playingStyleHint}
          >
            <Select id="playingStyle" {...form.register('playingStyle')}>
              <option value="">{t.onboarding.pickLater}</option>
              {Object.entries(PLAYING_STYLES).map(([group, styles]) => (
                <optgroup key={group} label={group}>
                  {styles.map((style) => (
                    <option key={style} value={style}>
                      {humanizeEnum(style)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t.onboarding.strongFoot} htmlFor="dominantFoot">
              <Select id="dominantFoot" {...form.register('dominantFoot')}>
                <option value="">—</option>
                <option value="RIGHT">Right</option>
                <option value="LEFT">Left</option>
                <option value="BOTH">Both</option>
              </Select>
            </Field>
            <Field label={t.onboarding.region} htmlFor="region">
              <Select id="region" {...form.register('region')}>
                {UZBEK_REGIONS.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="sr-only">{t.onboarding.measurements}</legend>
            <Field
              label={t.onboarding.heightCm}
              htmlFor="height"
              error={form.formState.errors.height?.message}
            >
              <Input id="height" inputMode="numeric" {...form.register('height')} />
            </Field>
            <Field
              label={t.onboarding.weightKg}
              htmlFor="weight"
              error={form.formState.errors.weight?.message}
            >
              <Input id="weight" inputMode="numeric" {...form.register('weight')} />
            </Field>
          </fieldset>

          {primaryPosition && (
            <p className="text-muted text-xs">
              <Label className="text-foreground">Tip</Label> — a {primaryPosition} with a chosen
              playing style shows up in far more academy searches.
            </p>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onBack} className="flex-1">
              <ArrowLeft aria-hidden /> Back
            </Button>
            <Button type="submit" className="flex-1" loading={form.formState.isSubmitting}>
              Create my card
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** The backend rejects unknown/empty fields (`forbidNonWhitelisted`), so drop blanks. */
function stripEmpty<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== '' && value !== undefined && !Number.isNaN(value),
    ),
  ) as Partial<T>;
}
