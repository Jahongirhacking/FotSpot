import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Search,
  ShieldCheck,
  Users,
  Video,
} from 'lucide-react';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import { academies, media, players, trials, type RecentClip } from '@/lib/api/resources';
import type { Media, PlayerProfile } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { ageBand, humanizeEnum, initials } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { FotSpotMark } from '@/components/shared/FotSpotMark';
import {
  BootAndBall,
  FootballBall,
  PitchBackdrop,
  TrophyArt,
} from '@/components/shared/FootballArt';
import { HeroVideo } from '@/components/shared/HeroVideo';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

/**
 * Landing page. Signed-in users keep it — it's the marketing surface, and the
 * header adapts — but the primary CTA changes to match where they actually are.
 */
export default async function LandingPage() {
  const session = await getSession();
  const { t } = await getServerT();

  // Every fetch is optional: this page must render with the API down.
  const [recent, academyList, trialList, clips] = await Promise.all([
    players.search({ pageSize: 6 }, { revalidate: 600 }).catch(() => ({
      items: [] as PlayerProfile[],
      total: 0,
      page: 1,
      pageSize: 6,
    })),
    academies.listPublic(undefined, { revalidate: 600 }).catch(() => []),
    trials.listUpcoming({ revalidate: 600 }).catch(() => []),
    // One request for the strip. This used to fetch a page of players and then
    // one media request per player — seven round trips, on the most-visited page
    // in the product, for visitors on the worst connections it ever serves.
    media.listRecent(8, { revalidate: 600 }).catch(() => [] as RecentClip[]),
  ]);

  const cta = await resolvePlayerCta(session);

  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <FotSpotMark className="size-8" />
          <span className="text-lg font-bold tracking-tight">FotSpot</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
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
        <section className="relative overflow-hidden px-4 py-14 sm:py-20">
          <PitchBackdrop className="opacity-60" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
            <div>
              <Badge variant="primary" className="mb-4">
                {t.common.tagline}
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
                {t.landing.heroTitle}
              </h1>
              <p className="text-muted mt-4 max-w-xl text-base sm:text-lg">{t.landing.heroBody}</p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {/* The one button whose destination depends on where the visitor
                    already is — see resolvePlayerCta. */}
                <Button asChild size="lg">
                  <Link href={cta.href}>
                    <FootballBall className="size-5" />
                    {cta.hasCard ? t.landing.viewMyCard : t.landing.createCard}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/players">
                    <Search aria-hidden /> {t.landing.browsePlayers}
                  </Link>
                </Button>
              </div>
              <p className="text-muted mt-4 text-xs">{t.landing.freeForever}</p>
            </div>

            <HeroVideo label={t.landing.watchHighlights} />
          </div>
        </section>

        {/* Live counts — an empty marketplace is the honest early state, so these
            only render once there is something to show. */}
        {(recent.total > 0 || academyList.length > 0 || trialList.length > 0) && (
          <section className="mx-auto max-w-6xl px-4 pb-4">
            <dl className="grid grid-cols-3 gap-3">
              <Stat icon={Users} label={t.landing.statPlayers} value={recent.total} />
              <Stat icon={Building2} label={t.landing.statAcademies} value={academyList.length} />
              <Stat icon={CalendarDays} label={t.landing.statTrials} value={trialList.length} />
            </dl>
          </section>
        )}

        <section className="mx-auto max-w-6xl px-4 py-14">
          <div className="grid gap-4 sm:grid-cols-3">
            <Pillar
              art={<BootAndBall className="h-16" />}
              title={t.landing.pillar1Title}
              body={t.landing.pillar1Body}
            />
            <Pillar
              art={<TrophyArt className="h-16" />}
              title={t.landing.pillar2Title}
              body={t.landing.pillar2Body}
            />
            <Pillar
              art={<FootballBall className="h-16" />}
              title={t.landing.pillar3Title}
              body={t.landing.pillar3Body}
            />
          </div>
        </section>

        {/* Real player media, not stock imagery. Poster-frame tiles only — playback
            happens on the player's own page (§21.6). */}
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

          {clips.length === 0 ? (
            <Card>
              <CardContent className="text-muted flex items-center gap-3 p-5 text-sm">
                <FootballBall className="size-8" />
                {t.landing.noClipsYet}
              </CardContent>
            </Card>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {clips.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/players/${item.player.id}`}
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
                        {humanizeEnum(item.category)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 p-2.5">
                      <span
                        className="bg-primary/15 text-primary grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                        aria-hidden
                      >
                        {initials(item.player.firstName, item.player.lastName)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">
                        {item.player.firstName} {item.player.lastName}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {ageBand(item.player.birthDate)}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {recent.items.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pb-14">
            <h2 className="mb-4 text-lg font-semibold">{t.landing.recentlyJoined}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {recent.items.slice(0, 3).map((player) => (
                <Card key={player.id}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {player.firstName} {player.lastName}
                      </p>
                      <p className="text-muted text-xs">
                        {player.primaryPosition ?? '—'} · {player.region ?? 'Uzbekistan'}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/players/${player.id}`} aria-label={`${player.firstName}`}>
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="border-border border-t px-4 py-12">
          <div className="text-muted mx-auto flex max-w-3xl items-start gap-3 text-sm">
            <ShieldCheck className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <p>
              <strong className="text-foreground">{t.landing.safetyTitle}</strong>{' '}
              {t.landing.safetyBody}
            </p>
          </div>
        </section>
      </main>

      <footer className="text-muted border-border border-t px-4 py-6 text-center text-xs">
        FotSpot · {t.common.tagline}
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
    await players.getMine({ token: session.accessToken, cache: 'no-store' });
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

function Pillar({ art, title, body }: { art: React.ReactNode; title: string; body: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3">{art}</div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-muted mt-1.5 text-sm">{body}</p>
      </CardContent>
    </Card>
  );
}
