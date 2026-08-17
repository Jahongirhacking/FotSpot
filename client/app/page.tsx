import { PipelineCanvas } from '@/components/landing/PipelineCanvas';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { FootballBall, PitchBackdrop } from '@/components/shared/FootballArt';
import { FotSpotMark } from '@/components/shared/FotSpotMark';
import { HeroBanner } from '@/components/shared/HeroBanner';
import { HeroVideo } from '@/components/shared/HeroVideo';
import { Reveal } from '@/components/shared/Reveal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ApiError } from '@/lib/api/client';
import { academies, media, players, trials, type RecentClip } from '@/lib/api/resources';
import type { PlayerProfile } from '@/lib/api/types';
import { SUPPORT_BOT } from '@/lib/contact';
import { getServerT } from '@/lib/i18n/server';
import { getSession } from '@/lib/session';
import { ageBand, humanizeEnum, initials } from '@/lib/utils';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Search,
  Send,
  ShieldCheck,
  Users,
  Video,
} from 'lucide-react';
import Link from 'next/link';

/**
 * Landing page. Signed-in users keep it — it's the marketing surface, and the
 * header adapts — but the primary CTA changes to match where they actually are.
 */
export default async function LandingPage() {
  const session = await getSession();
  const { t } = await getServerT();

  // Every fetch is optional: this page must render with the API down.
  const [recent, academyList, trialList, clips] = await Promise.all([
    players?.search({ pageSize: 6 }, { revalidate: 600 }).catch(() => ({
      items: [] as PlayerProfile[],
      total: 0,
      page: 1,
      pageSize: 6,
    })),
    academies.listPublic(undefined, { revalidate: 600 }).catch(() => []),
    trials?.listUpcoming({ revalidate: 600 }).catch(() => []),
    // One request for the strip. This used to fetch a page of players and then
    // one media request per player — seven round trips, on the most-visited page
    // in the product, for visitors on the worst connections it ever serves.
    media?.listRecent(8, { revalidate: 600 }).catch(() => [] as RecentClip[]),
  ]);

  const cta = await resolvePlayerCta(session);

  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <FotSpotMark className="size-11" />
          {/* The wordmark is the first thing to go on a narrow phone: the mark
              still says whose site this is, and the two sign-in buttons beside it
              are what the visitor actually came to press. */}
          <span className="hidden text-lg font-bold tracking-tight sm:inline">FotSpot</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden gap-2 [@media(min-width:360px)]:flex">
            <ThemeToggle compact />
          </div>
          <LanguageSwitcher />
          {session ? (
            <Button asChild size="sm">
              <Link href="/dashboard">{t.nav.home}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">{t.auth.signIn}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">{t.landing.getStarted}</Link>
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1">
        {/* Hero: pitch markings behind the copy, ball or video beside it. */}
        <section className="relative isolate overflow-hidden px-4 py-14 sm:py-24 lg:py-28">
          <HeroBanner />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
            {/* The hero animates on load rather than on scroll — it is already
                in view, so an observer would only delay it. The stagger is
                80ms and no more: long enough to read as one thing arriving in
                order, short enough that nobody waits for the button. */}
            <div>
              <Badge variant="primary" className="animate-rise mb-4">
                {t.common.tagline}
              </Badge>
              <h1
                className="animate-rise text-3xl font-bold tracking-tight sm:text-5xl"
                style={{ animationDelay: '80ms' }}
              >
                {t.landing.heroTitle}
              </h1>
              <p
                className="text-muted animate-rise mt-4 max-w-xl text-base sm:text-lg"
                style={{ animationDelay: '160ms' }}
              >
                {t.landing.heroBody}
              </p>

              <div
                className="animate-rise mt-8 flex flex-col gap-3 sm:flex-row"
                style={{ animationDelay: '240ms' }}
              >
                {/* The one button whose destination depends on where the visitor
                    already is — see resolvePlayerCta. */}
                <Button asChild size="lg">
                  <Link href={cta.href}>
                    <FootballBall className="animate-ball size-5" />
                    {cta.hasCard ? t.landing.viewMyCard : t.landing.createCard}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/players">
                    <Search aria-hidden /> {t.landing.browsePlayers}
                  </Link>
                </Button>
              </div>
              <p
                className="text-muted animate-rise mt-4 text-xs"
                style={{ animationDelay: '320ms' }}
              >
                {t.landing.freeForever}
              </p>
            </div>

            <div className="animate-fade" style={{ animationDelay: '200ms' }}>
              <HeroVideo label={t.landing.watchHighlights} />
            </div>
          </div>
        </section>

        {/* Who this is for, in their own terms. Three roles arrive on this page
            with three different questions, and one paragraph aimed at all of
            them answers none of them. */}
        <Reveal>
          <section className="mx-auto max-w-6xl px-4 pb-14">
            <div className="mb-6">
              <h2 className="text-lg font-semibold">{t.landing.valueTitle}</h2>
              <p className="text-muted text-sm">{t.landing.valueBody}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <RoleValue icon={Users} {...t.landing.value.players} />
              <RoleValue icon={Search} {...t.landing.value.scouts} />
              <RoleValue icon={Building2} {...t.landing.value.academies} />
            </div>
          </section>
        </Reveal>

        {/* The pipeline, drawn.
            The thing a first-time visitor cannot work out from any amount of
            prose is the *order* — that a recommendation gets nobody in, that a
            coach reads the profile before anybody is invited, and that the only
            step reaching a squad is somebody standing on a pitch. */}
        <Reveal>
          <section className="mx-auto max-w-6xl px-4 pb-14">
            <div className="mb-6">
              <h2 className="text-lg font-semibold">{t.landing.pipelineTitle}</h2>
              <p className="text-muted text-sm">{t.landing.pipelineBody}</p>
            </div>
            <PipelineCanvas />
          </section>
        </Reveal>

        {/* Live counts — an empty marketplace is the honest early state, so these
            only render once there is something to show. */}
        {(recent.total > 0 || academyList?.length > 0 || trialList?.length > 0) && (
          <Reveal>
            <section className="mx-auto max-w-6xl px-4 pb-8">
              <dl className="grid grid-cols-3 gap-3">
                <Link href={`/players`}>
                  <Stat icon={Users} label={t.landing.statPlayers} value={recent.total} />
                </Link>
                <Link href={`/academies`}>
                  <Stat
                    icon={Building2}
                    label={t.landing.statAcademies}
                    value={academyList?.length}
                  />
                </Link>
                <Link href={`/trials`}>
                  <Stat
                    icon={CalendarDays}
                    label={t.landing.statTrials}
                    value={trialList?.length}
                  />
                </Link>
              </dl>
            </section>
          </Reveal>
        )}

        {/* Real player media, not stock imagery. Poster-frame tiles only — playback
            happens on the player's own page (§21.6). */}
        <Reveal>
          <section className="mx-auto max-w-6xl px-4 pb-14">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Video className="text-primary size-5" aria-hidden /> {t.landing.latestClips}
                </h2>
                <p className="text-muted text-sm">{t.landing.latestClipsBody}</p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/players">{t.common.seeAll}</Link>
              </Button>
            </div>

            {clips?.length === 0 ? (
              <Card>
                <CardContent className="text-muted flex items-center gap-3 p-5 text-sm">
                  <FootballBall className="size-8" />
                  {t.landing.noClipsYet}
                </CardContent>
              </Card>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {clips?.map((item) => (
                  <li key={item?.id}>
                    <Link
                      href={`/players/${item?.player.id}`}
                      className="group border-border bg-surface hover:border-primary/40 rounded-card block overflow-hidden border transition-colors"
                    >
                      <div className="bg-surface-2 relative aspect-video">
                        <PitchBackdrop className="opacity-40" />
                        <div className="absolute inset-0 grid place-items-center">
                          <span className="bg-primary/90 text-primary-foreground grid size-9 place-items-center rounded-full">
                            <Video className="size-4" aria-hidden />
                          </span>
                        </div>
                        <Badge
                          variant="neutral"
                          className="bg-surface/85 absolute top-2 left-2 backdrop-blur"
                        >
                          {humanizeEnum(item?.category)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 p-2.5">
                        <span
                          className="bg-primary/15 text-primary grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                          aria-hidden
                        >
                          {initials(item?.player.firstName, item?.player.lastName)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {item?.player.firstName} {item?.player.lastName}
                        </span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {ageBand(item?.player.birthDate)}
                        </Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Reveal>

        {recent.items.length > 0 && (
          <Reveal>
            <section className="mx-auto max-w-6xl px-4 pb-14">
              <h2 className="mb-4 text-lg font-semibold">{t.landing.recentlyJoined}</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {recent.items.slice(0, 3).map((player) => (
                  <Card
                    key={player?.id}
                    className="hover:border-primary/40 transition-[transform,border-color] duration-200 hover:-translate-y-0.5"
                  >
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {player?.firstName} {player?.lastName}
                        </p>
                        <p className="text-muted text-xs">
                          {player?.primaryPosition ?? '—'} · {player?.region ?? 'Uzbekistan'}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/players/${player?.id}`} aria-label={`${player?.firstName}`}>
                          <ArrowRight aria-hidden />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </Reveal>
        )}

        {/* ---------- Local teams ----------
            Between the players who joined and the safety note, because it is an
            invitation rather than a claim: somebody who has just read that real
            people are arriving is the person most likely to wonder whether their
            own side belongs here.

            It asks rather than offers a form. A team is created by the platform
            team — the same rule as academies, for the same reason (§1.10) — and
            a self-service form would only be a queue of duplicates and tests
            that somebody has to clear by hand anyway. */}
        <Reveal>
          <section className="mx-auto max-w-6xl px-4 pb-14">
            <Card className="border-primary/25 bg-primary/[0.04] hover:border-primary/40 transition-colors duration-200">
              <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-2xl min-w-0">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Users className="text-primary size-5 shrink-0" aria-hidden />
                    {t.landing.localTeamTitle}
                  </h2>
                  <p className="text-muted mt-2 text-sm leading-relaxed">
                    {t.landing.localTeamBody}
                  </p>
                </div>

                {/*
                 * Straight into the bot with the sentence already written.
                 *
                 * `?text=` prefills the message box rather than sending anything,
                 * so the reader still presses send — which is what keeps it a
                 * request and not an accidental tap. It is localised because a
                 * request arriving in a language the reader does not write is one
                 * they have to translate before they can send it.
                 *
                 * `SUPPORT_BOT` rather than the handle inline: the contact page
                 * links to the same bot, and two copies of an address is one that
                 * gets changed in one place.
                 */}
                <Button asChild size="lg" className="shrink-0">
                  <a
                    href={`${SUPPORT_BOT}?text=${encodeURIComponent(t.landing.localTeamMessage)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Send aria-hidden /> {t.landing.localTeamCta}
                  </a>
                </Button>
              </CardContent>
            </Card>
          </section>
        </Reveal>

        <Reveal>
          <section className="border-border border-t px-4 py-12">
            <div className="text-muted mx-auto flex max-w-3xl items-start gap-3 text-sm">
              <ShieldCheck className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
              <p>
                <strong className="text-foreground">{t.landing.safetyTitle}</strong>{' '}
                {t.landing.safetyBody}
              </p>
            </div>
          </section>
        </Reveal>
      </main>

      {/* The policy is linked here and nowhere else. It belongs in front of
          somebody deciding whether to sign their child up, not in the navigation
          of an app they are already using — a menu entry would put it in the way
          of the twenty screens people actually came for. */}
      <footer className="text-muted border-border border-t px-4 py-6 text-center text-xs">
        <p>FotSpot · {t.common.tagline} · Bulalar Team</p>
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Link href="/privacy" className="hover:text-foreground underline underline-offset-2">
            {t.landing.privacyPolicy}
          </Link>
          <span aria-hidden>·</span>
          <Link href="/terms" className="hover:text-foreground underline underline-offset-2">
            {t.landing.termsOfService}
          </Link>
          <span aria-hidden>·</span>
          <Link href="/contact-us" className="hover:text-foreground underline underline-offset-2">
            {t.landing.contactUs}
          </Link>
        </p>
      </footer>
    </>
  );
}

/**
 * Where the "create your player card" button goes.
 *
 *   guest                  -> login, then straight into the wizard
 *   signed in, no card     -> the wizard
 *   signed in, has a card  -> their own card
 *
 * The guest case carries `next=/onboarding/player`, so signing in lands on card
 * creation rather than dumping them on a dashboard to find it themselves.
 */
async function resolvePlayerCta(
  session: Awaited<ReturnType<typeof getSession>>,
): Promise<{ href: string; hasCard: boolean }> {
  if (!session) {
    return { href: '/login?next=%2Fonboarding%2Fplayer', hasCard: false };
  }

  try {
    await players?.getMine({ token: session?.accessToken, cache: 'no-store' });
    // The card is the player's home screen (§21.6).
    return { href: '/dashboard', hasCard: true };
  } catch (error) {
    // 404 simply means "no card yet". Anything else (API down) also lands on the
    // wizard, which is the safe default — it will tell them if it can't proceed.
    if (!(error instanceof ApiError) || error.status !== 404) {
      return { href: '/onboarding/player', hasCard: false };
    }
    return { href: '/onboarding/player', hasCard: false };
  }
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="border-border bg-surface rounded-card flex items-center gap-3 border p-3">
      <span className="bg-primary/12 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dd className="text-lg leading-tight font-bold">{value}</dd>
        <dt className="text-muted truncate text-xs">{label}</dt>
      </div>
    </div>
  );
}

/**
 * One role's case for being here: a claim, and the three things behind it.
 *
 * A list rather than a paragraph because the points are independent — a scout
 * scanning this wants "does my reputation mean anything here", not a narrative —
 * and because a reader on a phone scans bullets and skips prose.
 */
function RoleValue({
  icon: Icon,
  title,
  body,
  points,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  points: string[];
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="bg-primary/10 text-primary mb-3 grid size-9 place-items-center rounded-lg">
          <Icon className="size-5" />
        </div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-muted mt-1.5 text-sm">{body}</p>
        <ul className="mt-3 space-y-1.5">
          {points?.map((point) => (
            <li key={point} className="text-muted flex gap-2 text-sm">
              <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
