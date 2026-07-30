'use client';

import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck, ArrowLeft, Check } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import { refreshSession, setActiveRoleCookie } from '@/lib/api/session-refresh';
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
import { ageFrom, cn, humanizeEnum } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input, Label, Select } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';

type Step = 'identity' | 'guardian' | 'football';

/**
 * Player profile wizard.
 *
 * STEP ORDER IS A SAFETY REQUIREMENT, not a UX preference. README §11.1: the flow
 * must branch on age *before* collecting anything else about a minor, so step 1 is
 * name + date of birth only, and an under-18 answer routes into the guardian gate
 * before any position, region, measurement or clip is asked for.
 */
export function PlayerWizard() {
  const [step, setStep] = React.useState<Step>('identity');
  const [identity, setIdentity] = React.useState<PlayerIdentityValues | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const age = identity ? ageFrom(identity.birthDate) : null;
  const isMinor = age !== null && age < 18;

  return (
    <div className="space-y-4">
      <Steps current={step} isMinor={isMinor} />

      {serverError && <Alert tone="danger">{serverError}</Alert>}

      {step === 'identity' && (
        <IdentityStep
          defaults={identity}
          onDone={(values) => {
            setIdentity(values);
            setStep(ageFrom(values.birthDate) < 18 ? 'guardian' : 'football');
          }}
        />
      )}

      {step === 'guardian' && age !== null && (
        <GuardianStep
          age={age}
          onBack={() => setStep('identity')}
          onContinue={() => setStep('football')}
        />
      )}

      {step === 'football' && identity && (
        <FootballStep
          identity={identity}
          onBack={() => setStep(isMinor ? 'guardian' : 'identity')}
          onError={setServerError}
        />
      )}
    </div>
  );
}

function Steps({ current, isMinor }: { current: Step; isMinor: boolean }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'identity', label: 'You' },
    ...(isMinor ? [{ key: 'guardian' as Step, label: 'Parent' }] : []),
    { key: 'football', label: 'Football' },
  ];
  const index = steps.findIndex((step) => step.key === current);

  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
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
  defaults,
  onDone,
}: {
  defaults: PlayerIdentityValues | null;
  onDone: (values: PlayerIdentityValues) => void;
}) {
  const form = useForm<PlayerIdentityValues>({
    resolver: zodResolver(playerIdentitySchema),
    defaultValues: defaults ?? { firstName: '', lastName: '', birthDate: '', gender: 'male' },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who&apos;s playing?</CardTitle>
        <CardDescription>
          Just the basics for now. Your date of birth decides which age group you&apos;re compared
          in — we never compare across age groups.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onDone)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="First name"
              htmlFor="firstName"
              required
              error={form.formState.errors.firstName?.message}
            >
              <Input id="firstName" {...form.register('firstName')} />
            </Field>
            <Field
              label="Last name"
              htmlFor="lastName"
              required
              error={form.formState.errors.lastName?.message}
            >
              <Input id="lastName" {...form.register('lastName')} />
            </Field>
          </div>

          <Field
            label="Date of birth"
            htmlFor="birthDate"
            required
            error={form.formState.errors.birthDate?.message}
          >
            <Input id="birthDate" type="date" {...form.register('birthDate')} />
          </Field>

          <Field
            label="Gender"
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

/**
 * The minor gate.
 *
 * This screen is honest about a limitation rather than faking consent: the backend
 * has no guardian model yet (README §11 is a launch blocker, and backend/README says
 * so). So this collects nothing, promises nothing, and states plainly what is
 * missing. Faking a consent checkbox here would be worse than blocking.
 */
function GuardianStep({
  age,
  onBack,
  onContinue,
}: {
  age: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [acknowledged, setAcknowledged] = React.useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="text-primary size-5" aria-hidden />A parent or guardian needs to
          be involved
        </CardTitle>
        <CardDescription>
          You&apos;re {age}, so FotSpot needs a parent or guardian linked to this profile before it
          can be seen by academies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert tone="warning" title="Guardian consent isn't built yet">
          This is an early build. Guardian accounts, consent and the private-by-default visibility
          rules are still being finished. Until they are, a profile created here stays{' '}
          <strong>visible only to you</strong> — it is not published to academies, and you should
          not upload photos or videos yet.
        </Alert>

        <label className="border-border hover:bg-surface-2 flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
          <input
            type="checkbox"
            className="accent-primary mt-0.5 size-4"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            I understand my profile won&apos;t be shown to academies until a parent or guardian has
            confirmed it, and I&apos;ll come back then.
          </span>
        </label>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} className="flex-1">
            <ArrowLeft aria-hidden /> Back
          </Button>
          <Button onClick={onContinue} disabled={!acknowledged} className="flex-1">
            Continue
          </Button>
        </div>
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
        <CardTitle>Your game</CardTitle>
        <CardDescription>
          All optional — you can fill these in later. Every one you add makes your card stronger.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Main position" htmlFor="primaryPosition">
              <Select id="primaryPosition" {...form.register('primaryPosition')}>
                <option value="">Not sure yet</option>
                {POSITIONS.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Other position" htmlFor="secondaryPosition">
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
            label="Playing style"
            htmlFor="playingStyle"
            hint="How you play, not just where. Academies search for this."
          >
            <Select id="playingStyle" {...form.register('playingStyle')}>
              <option value="">Pick later</option>
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
            <Field label="Strong foot" htmlFor="dominantFoot">
              <Select id="dominantFoot" {...form.register('dominantFoot')}>
                <option value="">—</option>
                <option value="RIGHT">Right</option>
                <option value="LEFT">Left</option>
                <option value="BOTH">Both</option>
              </Select>
            </Field>
            <Field label="Region" htmlFor="region">
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
            <legend className="sr-only">Measurements</legend>
            <Field
              label="Height (cm)"
              htmlFor="height"
              error={form.formState.errors.height?.message}
            >
              <Input id="height" inputMode="numeric" {...form.register('height')} />
            </Field>
            <Field
              label="Weight (kg)"
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
