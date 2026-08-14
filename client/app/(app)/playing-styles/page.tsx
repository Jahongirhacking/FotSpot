import type { Metadata } from 'next';
import { Sparkles } from 'lucide-react';
import { PLAYING_STYLE_INFO } from '@/lib/playing-styles';
import { PlayingStyleCard } from '@/components/player/PlayingStyleCard';
import { getServerT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: t.playingStyleModal?.title };
}

/**
 * Every playing style, as a grid.
 *
 * The list comes from `PLAYING_STYLE_INFO`'s own keys rather than a second array
 * beside it — a hand-written list is a list that goes stale the first time a
 * style is added, and silently, because nothing would fail.
 *
 * Each card links to `?showPlayingStyle=<value>`, which the controller in the
 * root layout turns into the modal. That is why this page needs no state and no
 * client boundary of its own.
 */
export default async function PlayingStylesPage() {
  const { t } = await getServerT();
  const styles = Object.keys(PLAYING_STYLE_INFO);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Sparkles className="text-primary size-5" aria-hidden />
          {t.playingStyleModal?.title}
        </h1>
        <p className="text-muted mt-1 text-sm">{t.playingStyleModal?.subtitle}</p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {styles.map((style) => (
          <li key={style}>
            <PlayingStyleCard style={style} />
          </li>
        ))}
      </ul>
    </div>
  );
}
