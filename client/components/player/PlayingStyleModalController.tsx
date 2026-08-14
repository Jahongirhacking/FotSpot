'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Users } from 'lucide-react';
import { PLAYING_STYLE_INFO } from '@/lib/playing-styles';
import { PlayingStyleCard } from '@/components/player/PlayingStyleCard';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { humanizeEnum } from '@/lib/utils';

/** The one query parameter this whole feature is driven by. */
export const PLAYING_STYLE_PARAM = 'showPlayingStyle';

/**
 * Opens the playing-style modal for whatever `?showPlayingStyle=` names.
 *
 * ## Why the URL is the state
 *
 * Mounted once in the root layout, so it works on every page — the landing page,
 * `/players`, a profile, the feed — without each of them knowing the feature
 * exists. There is no store and no context: the open/closed state *is* the query
 * parameter, which is what makes a link shareable, a refresh reopen the same
 * modal, and back/forward behave without any handling of their own. React reads
 * the URL; it never holds a second copy that could disagree with it.
 *
 * ## An unknown value opens nothing
 *
 * `?showPlayingStyle=NONSENSE` is looked up in `PLAYING_STYLE_INFO` and misses,
 * so the modal simply does not open and the page renders normally. The parameter
 * is left alone rather than stripped: rewriting somebody's URL because this
 * component did not recognise part of it is a surprising thing for a modal to do,
 * and a typo in a shared link should not silently become a different link.
 */
export function PlayingStyleModalController() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const style = searchParams.get(PLAYING_STYLE_PARAM);
  const info = style ? PLAYING_STYLE_INFO?.[style] : undefined;
  const open = Boolean(info);

  /**
   * Removes only this parameter.
   *
   * `/players?page=2&showPlayingStyle=X&search=messi` closes back to
   * `/players?page=2&search=messi` — the filters somebody built are not this
   * modal's to discard. `replace` rather than `push` so closing does not add a
   * history entry that back would immediately reopen.
   */
  const close = () => {
    const next = new URLSearchParams(searchParams);
    next.delete(PLAYING_STYLE_PARAM);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  if (!open || !style) return null;

  return (
    <Dialog open onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{humanizeEnum(style)}</DialogTitle>
          <DialogDescription>{info ? t.playingStyles?.[info?.key] : ''}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Not clickable: pressing it would re-set the parameter that opened
              this, which is either a no-op that looks broken or a way to change
              the style out from under the text beside it. */}
          <PlayingStyleCard style={style} clickable={false} />
        </DialogBody>

        <DialogFooter>
          <Button
            className="w-full"
            onClick={() => {
              // Client navigation, and the style value encoded exactly as stored —
              // /players reads `PlayingStyle` as its own filter.
              router.push(`/players?PlayingStyle=${encodeURIComponent(style)}`);
            }}
          >
            <Users aria-hidden /> {t.playingStyleModal?.showPlayers}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
