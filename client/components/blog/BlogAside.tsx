import Link from 'next/link';
import { ArrowRight, Building2, CalendarDays, Users } from 'lucide-react';
import type { BlogSpotlight, SpotlightAcademy, SpotlightPlayer } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n/dictionaries/uz';
import { interpolate } from '@/lib/i18n';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingImage } from '@/components/ui/LoadingImage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { initials } from '@/lib/utils';

/**
 * The column beside an article: six players and six academies, chosen at
 * random by the API for every view.
 *
 * A blog post is often the first page a visitor sees, and the article alone
 * says nothing about who is actually here. Two short lists say it: real
 * faces with a position and an age band, real academies with where they are.
 * Each ends in one link to the full directory rather than a second page of
 * picks — the sidebar introduces, the directory is where the searching happens.
 *
 * Server Component: the lists are plain links and images, so nothing here
 * needs to run in the browser.
 */
export function BlogAside({ spotlight, t }: { spotlight: BlogSpotlight; t: Dictionary }) {
  const hasPlayers = spotlight.players.length > 0;
  const hasAcademies = spotlight.academies.length > 0;
  if (!hasPlayers && !hasAcademies) return null;

  return (
    <div className="space-y-5">
      {hasPlayers && (
        <AsideCard
          icon={Users}
          title={t.blog.asidePlayers}
          moreHref="/players"
          more={t.blog.seeMore}
        >
          {spotlight.players.map((player) => (
            <li key={player.id}>
              <PlayerRow player={player} />
            </li>
          ))}
        </AsideCard>
      )}

      {hasAcademies && (
        <AsideCard
          icon={Building2}
          title={t.blog.asideAcademies}
          moreHref="/academies"
          more={t.blog.seeMore}
        >
          {spotlight.academies.map((academy) => (
            <li key={academy.id}>
              <AcademyRow academy={academy} t={t} />
            </li>
          ))}
        </AsideCard>
      )}
    </div>
  );
}

function AsideCard({
  icon: Icon,
  title,
  moreHref,
  more,
  children,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  moreHref: string;
  more: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="text-primary size-4" aria-hidden /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-border -mx-1 divide-y">{children}</ul>
        <Link
          href={moreHref}
          className="text-primary mt-3 inline-flex min-h-9 items-center gap-1 text-sm font-medium hover:underline"
        >
          {more} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}

/**
 * One player: the face, the name, and the three facts a scout reads first.
 * Handles first, like every other link to a profile, because a handle is
 * something a person can read out.
 */
function PlayerRow({ player }: { player: SpotlightPlayer }) {
  const href = player.username ? `/players/@${player.username}` : `/players/${player.id}`;
  const name = `${player.firstName} ${player.lastName}`.trim();
  const facts = [player.primaryPosition, player.ageBand, player.region].filter(Boolean).join(' · ');

  return (
    <Link
      href={href}
      className="hover:bg-surface-2 flex min-h-12 items-center gap-3 rounded-lg px-1 py-2 transition-colors"
    >
      <Avatar
        src={player.avatarUrl}
        fallback={initials(player.firstName, player.lastName)}
        alt=""
        className="size-9 text-xs"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {facts && <span className="text-muted block truncate text-xs">{facts}</span>}
      </span>
    </Link>
  );
}

/** One academy: the logo it is recognised by, where it is, and whether it is recruiting. */
function AcademyRow({ academy, t }: { academy: SpotlightAcademy; t: Dictionary }) {
  const place = [academy.region, academy.district].filter(Boolean).join(' · ');

  return (
    <Link
      href={`/academies/${academy.id}`}
      className="hover:bg-surface-2 flex min-h-12 items-center gap-3 rounded-lg px-1 py-2 transition-colors"
    >
      {academy.logoUrl ? (
        <LoadingImage
          src={academy.logoUrl}
          alt=""
          loading="lazy"
          spinner={false}
          className="border-border bg-surface size-9 shrink-0 rounded-lg border object-cover"
        />
      ) : (
        <span className="bg-primary/12 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
          <Building2 className="size-4" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{academy.name}</span>
        <span className="text-muted flex items-center gap-1 truncate text-xs">
          {place && <span className="truncate">{place}</span>}
          {academy.openTrials > 0 && (
            <span className="text-success inline-flex shrink-0 items-center gap-1 font-medium">
              {place && '·'}
              <CalendarDays className="size-3" aria-hidden />
              {interpolate(t.blog.asideOpenTrials, { count: academy.openTrials })}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
