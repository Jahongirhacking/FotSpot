import type { AcademyProfile } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { SOCIAL_MARKS, type SocialMark } from '@/lib/social-marks';

/**
 * The four networks an academy may link, drawn as their own marks.
 *
 * A parent scanning a profile recognises the Telegram plane before they read any
 * word next to it, and in this market Telegram is where an academy actually
 * answers questions.
 *
 * The marks themselves live in `lib/social-marks.ts` — the contact page draws
 * the same four, and a 900-character `d` attribute kept in two files is one
 * invisible character away from two different logos. What stays here is the
 * mapping from those marks to the academy fields that hold their URLs.
 */
const NETWORKS = [
  { field: 'telegramUrl', mark: SOCIAL_MARKS.telegram },
  { field: 'facebookUrl', mark: SOCIAL_MARKS.facebook },
  { field: 'instagramUrl', mark: SOCIAL_MARKS.instagram },
  { field: 'youtubeUrl', mark: SOCIAL_MARKS.youtube },
] as const satisfies ReadonlyArray<{ field: keyof AcademyProfile; mark: SocialMark }>;

export function AcademySocialLinks({
  academy,
  className,
}: {
  academy: AcademyProfile;
  className?: string;
}) {
  const present = NETWORKS.map((network) => ({
    ...network,
    href: academy?.[network.field] as string | null | undefined,
  })).filter((network) => network?.href);

  if (present.length === 0) return null;

  return (
    <ul className={cn('flex flex-wrap items-center gap-2', className)}>
      {present.map((network) => (
        <li key={network?.field}>
          <a
            href={network?.href ?? '#'}
            target="_blank"
            // A link off the platform must not keep a handle back to it, the same
            // rule the trial-note sanitiser enforces on academy-written HTML.
            rel="noopener noreferrer"
            aria-label={network?.mark?.label}
            title={network?.mark?.label}
            className={cn(
              'border-border text-muted grid size-10 place-items-center rounded-lg border transition-colors',
              network?.mark?.hover,
            )}
          >
            <svg viewBox="0 0 24 24" className="size-4.5" fill="currentColor" aria-hidden>
              <path d={network?.mark?.path} />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
