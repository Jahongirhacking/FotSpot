'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { LoadingImage } from '@/components/ui/LoadingImage';
import type { ProfessionalPlayer } from '@/lib/api/types';
import { CARD_THEME, positionGroup } from '@/lib/player-card';
import { academyHref, footLabel, fullName } from '@/lib/professional-players';
import { cn, initials } from '@/lib/utils';
import { Building2, ChevronRight, Footprints, Shirt } from 'lucide-react';
import Link from 'next/link';

/**
 * One professional, in full: the portrait on the group's colour, the two
 * facts the record holds as tiles, and the academies that claim them — each
 * a link, because "came through Bunyodkor" is the reason a parent is reading
 * this at all.
 */
export function ProfessionalPlayerDialog({
  player,
  open,
  onOpenChange,
}: {
  player: ProfessionalPlayer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  if (!player) return null;
  const theme = CARD_THEME[positionGroup(player.position)];
  const foot = footLabel(player.dominantFoot, t);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div
            className="relative overflow-hidden rounded-2xl py-5 pr-12 pl-5 text-white"
            style={{ backgroundImage: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
          >
            <div className="flex items-center gap-4">
              <span
                className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-black/25 text-2xl font-bold ring-2"
                style={{ boxShadow: `0 0 0 2px ${theme.ring}` }}
              >
                {player.avatarUrl ? (
                  <LoadingImage
                    src={player.avatarUrl}
                    alt=""
                    spinner={false}
                    className="size-full object-cover object-top"
                  />
                ) : (
                  initials(player.firstName, player.lastName)
                )}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium tracking-wider text-white/75 uppercase">
                  {t.professional.subtitleOne}
                </p>
                <DialogTitle className="text-xl leading-tight font-bold break-words text-white">
                  {fullName(player)}
                </DialogTitle>
              </div>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <dl className="grid grid-cols-2 gap-2">
            <Tile icon={Shirt} label={t.professional.position} value={player.position} t={t} />
            <Tile icon={Footprints} label={t.professional.dominantFoot} value={foot} t={t} />
          </dl>

          <div className="space-y-2">
            <p className="text-muted flex items-center gap-1.5 text-xs font-medium uppercase">
              <Building2 className="size-3.5" aria-hidden /> {t.professional.developedThrough}
            </p>
            {player.academies.length === 0 ? (
              <p className="text-muted text-sm">{t.professional.noAcademies}</p>
            ) : (
              <ul className="border-border divide-border divide-y overflow-hidden rounded-xl border">
                {player.academies.map((academy) => (
                  <li key={academy.id}>
                    <Link
                      href={academyHref(academy)}
                      className="hover:bg-surface-2 flex min-h-13 items-center gap-3 px-3 py-2 transition-colors"
                    >
                      <LoadingImage
                        src={academy.logoUrl}
                        alt=""
                        spinner={false}
                        className="size-9 shrink-0 rounded-lg object-cover"
                        fallback={
                          <span className="bg-surface-3 grid size-9 shrink-0 place-items-center rounded-lg">
                            <Building2 className="text-muted size-4" aria-hidden />
                          </span>
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{academy.name}</span>
                        {academy.username && (
                          <span className="text-muted block truncate text-xs">
                            @{academy.username}
                          </span>
                        )}
                      </span>
                      <ChevronRight className="text-muted size-4 shrink-0" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  t,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div className="bg-surface-2 rounded-xl p-3">
      <dt className="text-muted flex items-center gap-1.5 text-[11px] font-medium uppercase">
        <Icon className="size-3.5" aria-hidden /> {label}
      </dt>
      <dd className={cn('mt-1 text-base font-semibold', !value && 'text-muted font-normal')}>
        {value ?? t.professional.notSet}
      </dd>
    </div>
  );
}
