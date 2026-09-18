'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { ProfessionalPlayerDialog } from '@/components/professional/ProfessionalPlayerDialog';
import { LoadingImage } from '@/components/ui/LoadingImage';
import { useModalParam } from '@/hooks/useModalParam';
import { browserFetch } from '@/lib/api/browser';
import type { ProfessionalPlayer } from '@/lib/api/types';
import { CARD_THEME, positionGroup } from '@/lib/player-card';
import { PRO_PLAYER_PARAM } from '@/lib/player-url';
import { footLabel, fullName } from '@/lib/professional-players';
import { cn, initials } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';

/**
 * Professionals as a grid of portrait cards; pressing one opens their dialog.
 *
 * ## The card is the portrait
 *
 * A professional is known by their face, so the photograph fills the card
 * and the facts sit on it: the position in the corner, the name across the
 * bottom, the academies that claim them along the foot. The tint behind the
 * portrait is the same position-group gradient the player cards use
 * (`CARD_THEME`), so a forward reads as a forward here as it does there — and
 * a record with no photo still looks designed rather than broken.
 *
 * Shared by the directory, an academy's public page and the admin list, so
 * the three never drift apart. `compact` is the academy page's density.
 *
 * The open card is `?player=<id>` in the URL — Back closes it, a refresh keeps
 * it, the address can be shared. A shared link may name a player this grid
 * does not hold (a later page of the directory), so the card is fetched on
 * its own in that case rather than silently not opening.
 */
export function ProfessionalPlayerGrid({
  players,
  compact = false,
  className,
}: {
  players: ProfessionalPlayer[];
  compact?: boolean;
  className?: string;
}) {
  const modal = useModalParam(PRO_PLAYER_PARAM);
  const inList = players.find((player) => player.id === modal.value) ?? null;
  const fetched = useQuery({
    queryKey: ['professional-player', modal.value],
    queryFn: () => browserFetch<ProfessionalPlayer>(`/professional-players/${modal.value}`),
    enabled: Boolean(modal.value) && !inList,
    retry: false,
  });
  const open = inList ?? fetched.data ?? null;

  return (
    <>
      <ul
        className={cn(
          'grid gap-3 sm:gap-4',
          compact
            ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
          className,
        )}
      >
        {players.map((player) => (
          <li key={player.id}>
            <ProfessionalPlayerCard
              player={player}
              compact={compact}
              onOpen={() => modal.open(player.id)}
            />
          </li>
        ))}
      </ul>

      <ProfessionalPlayerDialog
        player={open}
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) modal.close();
        }}
      />
    </>
  );
}

export function ProfessionalPlayerCard({
  player,
  compact = false,
  onOpen,
}: {
  player: ProfessionalPlayer;
  compact?: boolean;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const theme = CARD_THEME[positionGroup(player.position)];
  const foot = footLabel(player.dominantFoot, t);
  const logos = player.academies.filter((academy) => academy.logoUrl).slice(0, 3);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={fullName(player)}
      className="group bg-surface border-border focus-visible:ring-primary block w-full overflow-hidden rounded-2xl border text-left shadow-sm transition duration-200 hover:shadow-lg focus-visible:ring-2 focus-visible:outline-none"
    >
      <span
        className="relative block aspect-[4/5] w-full overflow-hidden"
        style={{ backgroundImage: `linear-gradient(160deg, ${theme.from}, ${theme.to})` }}
      >
        {player.avatarUrl ? (
          <LoadingImage
            src={player.avatarUrl}
            alt=""
            spinner={false}
            className="absolute inset-0 size-full object-cover object-top transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span
            className={cn(
              'absolute inset-0 grid place-items-center font-bold tracking-wider text-white/85',
              compact ? 'text-3xl' : 'text-5xl',
            )}
            aria-hidden
          >
            {initials(player.firstName, player.lastName)}
          </span>
        )}

        {/* A halo behind the portrait, in the group's ring colour, so the
            frame reads as a card and not a cropped photograph. */}
        <span
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: `inset 0 0 0 2px ${theme.ring}33` }}
          aria-hidden
        />

        {player.position && (
          <span className="absolute top-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-[11px] font-bold tracking-widest text-white uppercase backdrop-blur-sm">
            {player.position}
          </span>
        )}
        {foot && !compact && (
          <span className="absolute top-2 right-2 rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {foot}
          </span>
        )}

        <span
          className="absolute inset-x-0 bottom-0 px-3 pt-12 pb-3"
          style={{
            backgroundImage:
              'linear-gradient(to top, rgba(0,0,0,.88), rgba(0,0,0,.35) 60%, transparent)',
          }}
        >
          <span className="block truncate text-[11px] font-medium tracking-wider text-white/75 uppercase">
            {player.firstName}
          </span>
          <span
            className={cn(
              'block truncate leading-tight font-bold text-white',
              compact ? 'text-sm' : 'text-lg',
            )}
          >
            {player.lastName}
          </span>
        </span>
      </span>

      {!compact && (
        <span className="flex min-h-10 items-center gap-2 px-3 py-2">
          {logos.length > 0 ? (
            <span className="flex -space-x-2" aria-hidden>
              {logos?.map((academy) => (
                <LoadingImage
                  key={academy.id}
                  src={academy.logoUrl}
                  alt=""
                  spinner={false}
                  className="ring-surface size-6 rounded-full object-cover ring-2"
                  // A logo that fails to load must not leave a broken-image glyph
                  // on the card; the crest below stands in for it.
                  fallback={
                    <span className="bg-surface-3 ring-surface grid size-6 place-items-center rounded-full ring-2">
                      <Building2 className="text-muted size-3" aria-hidden />
                    </span>
                  }
                />
              ))}
            </span>
          ) : (
            <Building2 className="text-muted size-4 shrink-0" aria-hidden />
          )}
          <span className="text-muted min-w-0 flex-1 truncate text-xs">
            {player?.academies?.length > 0
              ? player.academies.map((academy) => academy.name).join(' · ')
              : t.professional.noAcademies}
          </span>
        </span>
      )}
    </button>
  );
}
