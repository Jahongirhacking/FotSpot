'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { homeHrefForRole } from '@/components/layout/nav';
import { PitchPositionPicker } from '@/components/player/PitchPositionPicker';
import { PlayingStylePicker } from '@/components/player/PlayingStylePicker';
import { RegionDistrictPicker } from '@/components/shared/RegionDistrictPicker';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, Label, Select } from '@/components/ui/Field';
import { browserFetch } from '@/lib/api/browser';
import { refreshSession, setActiveRoleCookie } from '@/lib/api/session-refresh';
import type { PlayerProfile } from '@/lib/api/types';
import { positionGroup } from '@/lib/player-card';
import {
  POSITIONS,
  playerFootballSchema,
  playerIdentitySchema,
  type PlayerFootballInput,
  type PlayerFootballValues,
  type PlayerIdentityValues,
} from '@/lib/schemas/player';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';

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
        <li
          key={step.key}
          className={cn(
            'flex flex-1 items-center gap-2',
            position === steps?.length - 1 && 'flex-0',
          )}
        >
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

  /*
   * If the account already has a name, don't ask for it again.
   *
   * One name per person, held on the account — a player is not a separate human
   * from the account that holds them, and neither is a scout or a coach. So this
   * shows what the account says and links to the one screen that changes it,
   * rather than duplicating the field here and letting the two drift.
   *
   * Which matters most for OAuth: signing in with Google fills the name from the
   * Google profile, so the field was pre-filled and read-only and there was no
   * visible way to correct it — the link said "edit profile", which does not
   * read as "the name is wrong, fix it here".
   *
   * `?next=` so the wizard is where you land after saving, instead of being
   * dropped on the profile page having lost the step you were on.
   */
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
        <CardDescription>{t.onboarding.whoIsPlayingHint}</CardDescription>
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
                href="/profile/edit?next=%2Fonboarding%2Fplayer"
                className="text-primary shrink-0 text-xs font-medium hover:underline"
              >
                {t.profile.changeName}
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
                <Input
                  id="firstName"
                  {...form.register('firstName')}
                  placeholder={t.placeholders.firstName}
                />
              </Field>
              <Field
                label={t.auth.lastName}
                htmlFor="lastName"
                required
                error={form.formState.errors.lastName?.message}
              >
                <Input
                  id="lastName"
                  {...form.register('lastName')}
                  placeholder={t.placeholders.lastName}
                />
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
  const { t, f } = useI18n();
  // Input/output types differ because of z.coerce — see lib/schemas/player.ts.
  const form = useForm<PlayerFootballInput, unknown, PlayerFootballValues>({
    resolver: zodResolver(playerFootballSchema),
    // No default province: pre-selecting one files every player who skips the
    // field in whichever province happens to sort first.
    defaultValues: { region: '' },
  });

  // useWatch, not form.watch: watch() returns a fresh function each render, which
  // opts the whole component out of React Compiler memoization.
  const primaryPosition = useWatch({ control: form.control, name: 'primaryPosition' });
  const playingStyle = useWatch({ control: form.control, name: 'playingStyle' });
  const region = useWatch({ control: form.control, name: 'region' });
  const district = useWatch({ control: form.control, name: 'district' });

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
      // the player's home screen). Resolved through the menu rather than written
      // out, so it follows the player's first entry if that ever moves.
      window.location.assign(homeHrefForRole('player'));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not create your profile.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.onboarding.yourGame}</CardTitle>
        <CardDescription>{t.onboarding.optionalHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {/*
            The pitch and the two selects show the same answer.
            The pitch is how most people will pick — a dot in a shape they already
            know — while the selects stay because they are what a keyboard user
            and a screen reader reach first, and because "AM" is faster than
            aiming at a circle once you know the codes.
          */}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
            <PitchPositionPicker
              mode="single"
              label={t.onboarding.mainPosition}
              value={primaryPosition ? [primaryPosition] : []}
              onChange={(next) => form.setValue('primaryPosition', next[0], { shouldDirty: true })}
            />

            <div className="space-y-3">
              <Field
                label={t.onboarding.mainPosition}
                htmlFor="primaryPosition"
                hint={t.onboarding.positionPickHint}
              >
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
          </div>

          {/*
            Cards rather than a dropdown: a style is recruitment vocabulary
            (§21.3), and picking one from fourteen unexplained words is guessing.
            Narrowed to the group matching the chosen position, so a striker
            reads four options instead of fourteen.
          */}
          <Field
            label={t.onboarding.playingStyle}
            htmlFor="playingStyle"
            hint={t.onboarding.playingStyleHint}
          >
            <input type="hidden" id="playingStyle" {...form.register('playingStyle')} />
            <PlayingStylePicker
              value={playingStyle}
              positionGroup={positionGroup(primaryPosition ?? null)}
              onChange={(next) => form.setValue('playingStyle', next, { shouldDirty: true })}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t.onboarding.strongFoot} htmlFor="dominantFoot">
              <Select id="dominantFoot" {...form.register('dominantFoot')}>
                <option value="">—</option>
                <option value="RIGHT">{t.onboarding.right}</option>
                <option value="LEFT">{t.onboarding.left}</option>
                <option value="BOTH">{t.onboarding.both}</option>
              </Select>
            </Field>
            {/* District options come from the chosen province — see
                RegionDistrictPicker. Registered as hidden inputs so RHF still
                owns the values. */}
            <input type="hidden" {...form.register('region')} />
            <input type="hidden" {...form.register('district')} />
          </div>

          <RegionDistrictPicker
            idPrefix="wizard"
            region={region ?? ''}
            district={district ?? ''}
            onRegionChange={(next) => form.setValue('region', next, { shouldDirty: true })}
            onDistrictChange={(next) => form.setValue('district', next, { shouldDirty: true })}
          />

          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <legend className="sr-only">{t.onboarding.measurements}</legend>
            <Field
              label={t.onboarding.heightCm}
              htmlFor="height"
              error={form.formState.errors.height?.message}
            >
              <Input
                id="height"
                inputMode="numeric"
                {...form.register('height')}
                placeholder={t.placeholders.height}
              />
            </Field>
            <Field
              label={t.onboarding.weightKg}
              htmlFor="weight"
              error={form.formState.errors.weight?.message}
            >
              <Input
                id="weight"
                inputMode="numeric"
                {...form.register('weight')}
                placeholder={t.placeholders.weight}
              />
            </Field>
          </fieldset>

          {primaryPosition && (
            <p className="text-muted text-xs">
              <Label className="text-foreground">{t.onboarding.tipLabel}</Label> —{' '}
              {f(t.onboarding.tipStyle, { position: primaryPosition ?? '' })}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="flex-1 cursor-pointer"
            >
              <ArrowLeft aria-hidden /> {t.common.back}
            </Button>
            <Button
              type="submit"
              className="flex-1 cursor-pointer"
              loading={form.formState.isSubmitting}
            >
              {t.onboarding.createMyCard}
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
