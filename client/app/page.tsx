import { LandingContainer, LandingSection } from '@/components/landing/LandingSection';
import { PipelineCanvas } from '@/components/landing/PipelineCanvas';
import { StatCard } from '@/components/landing/StatCard';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { FootballBall, PitchBackdrop } from '@/components/shared/FootballArt';
import { FotSpotMark } from '@/components/shared/FotSpotMark';
import { HeroBanner } from '@/components/shared/HeroBanner';
import { HeroVideo } from '@/components/shared/HeroVideo';
import { Reveal } from '@/components/shared/Reveal';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { LoadingImage } from '@/components/ui/LoadingImage';
import { ApiError } from '@/lib/api/client';
import { academies, media, players, trials, type RecentClip } from '@/lib/api/resources';
import type { PlayerProfile } from '@/lib/api/types';
import { SUPPORT_BOT } from '@/lib/contact';
import { getServerT } from '@/lib/i18n/server';
import { pageMetadata } from '@/lib/seo';
import { getSession } from '@/lib/session';
import { ageBand, cn, humanizeEnum, initials } from '@/lib/utils';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  IdCard,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * Landing page. Signed-in users keep it — it's the marketing surface, and the
 * header adapts — but the primary CTA changes to match where they actually are.
 */
/**
 * The homepage's own canonical, now that the layout no longer imposes one on
 * every page. Title and description are the site's, which is correct *here*.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return pageMetadata({ path: '/', title: t.seo.title, description: t.seo.description });
}

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
    trials?.listUpcoming({}, { revalidate: 600 }).catch(() => []),
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
                    <IdCard aria-hidden />
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
          <LandingSection tone="tint">
            <LandingContainer>
              <div className="mb-8">
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                  {t.landing.valueTitle}
                </h2>
                <p className="text-muted mt-1 text-sm sm:text-base">{t.landing.valueBody}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <RoleValue icon={Users} {...t.landing.value.players} />
                <RoleValue icon={Search} {...t.landing.value.scouts} />
                <RoleValue icon={Building2} {...t.landing.value.academies} />
              </div>
            </LandingContainer>
          </LandingSection>
        </Reveal>

        {/* Real player media, not stock imagery. Poster-frame tiles only — playback
            happens on the player's own page (§21.6). The one dark band on the
            page: this is the featured content, and it is framed as such. */}
        <Reveal>
          <LandingSection tone="green">
            <PitchBackdrop className="text-white/10 opacity-80" />
            <LandingContainer>
              <SectionHeading
                icon={Video}
                title={t.landing.latestClips}
                body={t.landing.latestClipsBody}
                actionHref="/login?next=/feed"
                actionLabel={t.common.seeAll}
                tone="dark"
              />

              {clips?.length === 0 ? (
                <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-5 text-sm text-white">
                  <FootballBall className="size-8" />
                  {t.landing.noClipsYet}
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                  {clips?.map((item) => (
                    <li key={item?.id}>
                      <Link
                        href={`/players/${item?.player.id}`}
                        className="group bg-surface border-border text-foreground hover:border-primary focus-visible:ring-ring block overflow-hidden rounded-2xl border shadow-md transition-[transform,translate,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <div className="relative aspect-video overflow-hidden bg-black/85">
                          {/*
                            The clip's own frame when it has one. `posterUrl` is
                            already signed by the API alongside the video URL — one
                            response, no second request — and the pitch stays as
                            the fallback for a clip whose cover capture failed in
                            the browser. `object-cover` keeps the 16:9 box honest
                            whatever the phone recorded; a broken image simply
                            shows the pitch behind it, via the same loader every
                            other image on the site uses.
                          */}
                          {item?.posterUrl ? (
                            <LoadingImage
                              src={item.posterUrl}
                              alt=""
                              loading="lazy"
                              spinner={false}
                              className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                              fallback={<PitchBackdrop className="text-primary/30 opacity-70" />}
                            />
                          ) : (
                            <PitchBackdrop className="text-primary/30 opacity-70" />
                          )}
                          {/* Keeps the play mark and the badge legible on a bright frame. */}
                          <div
                            aria-hidden
                            className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/20"
                          />
                          <div className="absolute inset-0 grid place-items-center">
                            <span className="bg-primary text-primary-foreground grid size-10 place-items-center rounded-full shadow-lg ring-4 ring-black/20 transition-transform duration-300 group-hover:scale-110 sm:size-11">
                              <Video className="size-4" aria-hidden />
                            </span>
                          </div>
                          <Badge
                            variant="neutral"
                            className="absolute top-2 left-2 bg-black/60 text-[10px] text-white backdrop-blur"
                          >
                            {humanizeEnum(item?.category)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2.5 p-3">
                          {/* Who the footage belongs to — their own picture when
                              they have one, initials otherwise. Separate from the
                              cover above, which is the clip. */}
                          <Avatar
                            src={item?.player.avatarUrl}
                            fallback={initials(item?.player.firstName, item?.player.lastName)}
                            className="ring-primary/20 size-8 shrink-0 ring-1"
                          />
                          <span className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">
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
            </LandingContainer>
          </LandingSection>
        </Reveal>

        {recent?.items?.length > 0 && (
          <Reveal>
            <LandingSection tone="base">
              <LandingContainer>
                <SectionHeading
                  icon={Sparkles}
                  title={t.landing.recentlyJoined}
                  body={t.landing.recentlyJoinedBody}
                  actionHref="/players?sort=newest"
                  actionLabel={t.common.seeAll}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  {recent.items.slice(0, 3).map((player) => (
                    <Card
                      key={player?.id}
                      className="group hover:border-primary/50 rounded-2xl transition-[transform,translate,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg"
                    >
                      <Link href={`/players/${player?.id}`} aria-label={`${player?.firstName}`}>
                        <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                          {/* The player's own picture when they have one; initials
                              in the card palette otherwise — the same fallback
                              the rest of the site uses. */}
                          <Avatar
                            src={player?.avatarUrl}
                            fallback={initials(player?.firstName, player?.lastName)}
                            className="ring-primary/20 size-12 shrink-0 ring-2 sm:size-14"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-semibold">
                              {player?.firstName} {player?.lastName}
                            </p>
                            <p className="text-muted mt-0.5 truncate text-sm">
                              {player?.primaryPosition ?? '—'} · {player?.region ?? 'Uzbekistan'}
                            </p>
                          </div>
                          <span
                            aria-hidden
                            className="bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-300"
                          >
                            <ArrowRight className="size-4" />
                          </span>
                        </CardContent>
                      </Link>
                    </Card>
                  ))}
                </div>
              </LandingContainer>
            </LandingSection>
          </Reveal>
        )}

        {/* The pipeline, drawn.
            The thing a first-time visitor cannot work out from any amount of
            prose is the *order* — that a recommendation gets nobody in, that a
            coach reads the profile before anybody is invited, and that the only
            step reaching a squad is somebody standing on a pitch. */}
        <Reveal>
          <LandingSection tone="tint">
            <LandingContainer>
              <div className="mb-8">
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                  {t.landing.pipelineTitle}
                </h2>
                <p className="text-muted mt-1 text-sm sm:text-base">{t.landing.pipelineBody}</p>
              </div>
              <PipelineCanvas />
            </LandingContainer>
          </LandingSection>
        </Reveal>

        {/* ---------- Academies ----------
            Above local teams, and styled apart from them, because they are two
            different asks and a reader should not have to compare paragraphs to
            work out which one is theirs.

            The distinction is real, not decorative: an academy is vetted before
            it exists (§1.10) and gets coaches, trials and online review; a local
            team is none of that. So this one is bordered and accented rather
            than tinted, which reads as the heavier of the two — and it says
            plainly that a check is involved, because somebody who would fail one
            is better off knowing now. */}
        <Reveal>
          <LandingSection tone="base" className="pb-4 sm:pb-6">
            <LandingContainer>
              {/* Live counts, straight under the hero — an empty marketplace is the
            honest early state, so these only render once there is something to
            show. Three links to three screens, as a list (see StatCard for why
            each is a photograph). */}
              {(recent.total > 0 || academyList?.length > 0 || trialList?.length > 0) && (
                <Reveal>
                  <LandingSection tone="base" className="pt-2 sm:pt-4">
                    <LandingContainer>
                      <ul className="grid gap-4 sm:grid-cols-3">
                        <li>
                          <Link
                            href="/players"
                            className="focus-visible:ring-ring block rounded-2xl focus-visible:ring-2 focus-visible:outline-none"
                          >
                            <StatCard
                              icon={Users}
                              label={t.landing.statPlayers}
                              value={recent.total}
                              focus="18% 45%"
                              bgImg="/images/stats/players.png"
                            />
                          </Link>
                        </li>
                        <li>
                          <Link
                            href="/academies"
                            className="focus-visible:ring-ring block rounded-2xl focus-visible:ring-2 focus-visible:outline-none"
                          >
                            <StatCard
                              icon={Building2}
                              label={t.landing.statAcademies}
                              value={academyList?.length}
                              focus="88% 50%"
                              bgImg="/images/stats/academies.png"
                            />
                          </Link>
                        </li>
                        <li>
                          <Link
                            href="/trials"
                            className="focus-visible:ring-ring block rounded-2xl focus-visible:ring-2 focus-visible:outline-none"
                          >
                            <StatCard
                              icon={CalendarDays}
                              label={t.landing.statTrials}
                              value={trialList?.length}
                              focus="63% 55%"
                              bgImg="/images/stats/trials.png"
                            />
                          </Link>
                        </li>
                      </ul>
                    </LandingContainer>
                  </LandingSection>
                </Reveal>
              )}

              <Card className="border-primary/30 from-primary/[0.10] to-accent/[0.06] hover:border-primary/50 overflow-hidden border-2 bg-gradient-to-br transition-colors duration-200">
                <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
                  <div className="max-w-2xl min-w-0">
                    {/* The icon in a filled tile rather than inline: it gives the
                      card a mark of its own, which is most of what separates the
                      thing being offered from the one mentioned below it. */}
                    <span className="bg-primary text-primary-foreground mb-3 grid size-11 place-items-center rounded-xl shadow-sm">
                      <Building2 className="size-6" aria-hidden />
                    </span>
                    <h2 className="text-xl font-bold sm:text-2xl">{t.landing.academyTitle}</h2>
                    <p className="text-muted mt-2 text-sm leading-relaxed">
                      {t.landing.academyBody}
                    </p>
                  </div>

                  {/* Same bot, different sentence — one address, and the message
                    says which of the two the writer is asking for so nobody has
                    to be asked back. */}
                  <Button asChild size="lg" className="shrink-0 cursor-pointer shadow-sm">
                    <a
                      href={`${SUPPORT_BOT}?text=${encodeURIComponent(t.landing.academyMessage)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Send aria-hidden /> {t.landing.academyCta}
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </LandingContainer>
          </LandingSection>
        </Reveal>

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
          <LandingSection tone="base" className="pt-0 sm:pt-0">
            <LandingContainer>
              {/* Quieter on purpose. Both asks are real, but an academy is what
                this platform is built around — and two cards at the same volume
                make a reader decide which to read rather than which is theirs. */}
              <Card className="hover:border-border/80 transition-colors duration-200">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="max-w-2xl min-w-0">
                    <h3 className="text-muted flex items-center gap-2 text-base font-semibold">
                      <Users className="size-4 shrink-0" aria-hidden />
                      {t.landing.localTeamTitle}
                    </h3>
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
                  <Button asChild size="sm" variant="outline" className="shrink-0">
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
            </LandingContainer>
          </LandingSection>
        </Reveal>

        <Reveal>
          <section className="border-border bg-surface-2 border-t px-4 py-12">
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

/**
 * The heading every listing section on this page wears.
 *
 * They had drifted: the clips section had an icon, a subtitle and a "see all",
 * and the players below it had a bare `h2` and nothing else — so two sections
 * doing the same job announced themselves in two different voices. One
 * component means a section cannot quietly grow its own style, and the icon and
 * action are optional so a section without one is still the same heading.
 */
function SectionHeading({
  icon: Icon,
  title,
  body,
  actionHref,
  actionLabel,
  tone = 'light',
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  actionHref?: string;
  actionLabel?: string;
  /** On the black band the heading is white and the action is outlined in white. */
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <div className="mb-6 flex items-end justify-between gap-3 sm:mb-8">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 text-xl font-bold tracking-tight sm:text-2xl">
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-xl',
              dark ? 'bg-white text-green-900' : 'bg-primary/12 text-primary',
            )}
          >
            <Icon className="size-4.5" aria-hidden />
          </span>
          {title}
        </h2>
        {body && (
          <p className={cn('mt-1.5 text-sm sm:text-base', dark ? 'text-white/70' : 'text-muted')}>
            {body}
          </p>
        )}
      </div>
      {actionHref && actionLabel && (
        <Button
          asChild
          variant={dark ? 'outline' : 'ghost'}
          size="sm"
          className={cn(
            'shrink-0 cursor-pointer',
            // Ghost rather than outline on the black band: outline brings the
            // page's white surface with it, and white text on it disappears.
            dark &&
              'border border-white/25 bg-white text-green-900 hover:bg-white/10 hover:text-white dark:border-gray-800/25',
          )}
        >
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
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
    <Card className="hover:border-primary/40 rounded-2xl transition-[transform,translate,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg">
      <CardContent className="p-5 sm:p-6">
        <div className="bg-primary/10 text-primary mb-3 grid size-10 place-items-center rounded-xl">
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
