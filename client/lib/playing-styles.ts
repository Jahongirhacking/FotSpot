import type { Dictionary } from '@/lib/i18n';
import { mediaAsset } from '@/lib/media-url';
import { PlayingStyles } from './schemas/player';

/**
 * What each playing style means, and who plays it.
 *
 * ## Why a style needs explaining at all
 *
 * "Destroyer" and "Orchestrator" are recruitment vocabulary (§21.3): an academy
 * recruits for a *role*, not a position. A fourteen-year-old picking from a
 * dropdown of fourteen such words is guessing, and a guessed style is worse than
 * none — it points academies at the wrong player. One line of plain description
 * and a name they recognise turns the guess into a choice.
 *
 * ## The exemplar is a name, not a photograph
 *
 * `exemplar` is a footballer famous for playing this way. It is a fact, and text
 * costs nothing to ship.
 *
 * `imageUrl` is deliberately empty. Photographs of named living footballers are
 * somebody's copyright and somebody's likeness, and shipping them because they
 * are easy to find is how a product acquires a legal problem it did not budget
 * for. Drop a licensed file in `public/styles/` and set the path here; until
 * then the picker draws an initialled crest, which reads as an illustration
 * rather than a broken image.
 */
export interface PlayingStyleInfo {
  /** Key into `t.playingStyles` — the one-line description. */
  key: keyof Dictionary['playingStyles'];
  /** A footballer known for it. Shown as a name; see the note on images. */
  exemplar: string;
  /** Path under `public/`. Empty until a licensed image is added. */
  imageUrl?: string;
}

const playingStyleMediaPath = 'images/playing-styles';

export const PLAYING_STYLE_INFO: Record<string, PlayingStyleInfo> = {
  // Forward
  [PlayingStyles.GOAL_POACHER]: {
    key: PlayingStyles.GOAL_POACHER,
    exemplar: 'Kylian Mbappe',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/goal_poacher.png`) ?? undefined,
  },
  [PlayingStyles.FOX_IN_THE_BOX]: {
    key: PlayingStyles.FOX_IN_THE_BOX,
    exemplar: 'Erling Haaland',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/fox_in_the_box.png`) ?? undefined,
  },
  [PlayingStyles.DEEP_LYING_FORWARD]: {
    key: PlayingStyles.DEEP_LYING_FORWARD,
    exemplar: 'Cristiano Ronaldo',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/deep_lying_forward.png`) ?? undefined,
  },
  [PlayingStyles.PROLIFIC_WINGER]: {
    key: PlayingStyles.PROLIFIC_WINGER,
    exemplar: 'Lamine Yamal',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/prolific_winger.png`) ?? undefined,
  },
  [PlayingStyles.CLASSIC_10]: {
    key: PlayingStyles.CLASSIC_10,
    exemplar: 'Lionel Messi',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/classic_10.png`) ?? undefined,
  },

  // Midfield
  [PlayingStyles.BOX_TO_BOX]: {
    key: PlayingStyles.BOX_TO_BOX,
    exemplar: 'Steven Gerrard',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/box_to_box.png`) ?? undefined,
  },
  [PlayingStyles.PLAYMAKER]: {
    key: PlayingStyles.PLAYMAKER,
    exemplar: 'Kevin De Bruyne',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/playmaker.png`) ?? undefined,
  },
  [PlayingStyles.ANCHOR_MAN]: {
    key: PlayingStyles.DESTROYER,
    exemplar: 'Rodri',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/anchor_man.png`) ?? undefined,
  },
  [PlayingStyles.ORCHESTRATOR]: {
    key: PlayingStyles.ORCHESTRATOR,
    exemplar: 'Sergio Busquets',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/orchestrator.png`) ?? undefined,
  },

  // Defence
  [PlayingStyles.BUILD_UP]: {
    key: PlayingStyles.BUILD_UP,
    exemplar: 'Virgil van Dijk',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/build_up.png`) ?? undefined,
  },
  [PlayingStyles.DESTROYER]: {
    key: PlayingStyles.DESTROYER,
    exemplar: 'Abduqodir Husanov',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/destroyer.png`) ?? undefined,
  },
  [PlayingStyles.OFFENSIVE_WINGBACK]: {
    key: PlayingStyles.OFFENSIVE_WINGBACK,
    exemplar: 'Roberto Carlos',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/offensive_wingback.png`) ?? undefined,
  },
  [PlayingStyles.DEFENSIVE_FULLBACK]: {
    key: PlayingStyles.DEFENSIVE_FULLBACK,
    exemplar: 'Paolo Maldini',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/defensive_fullback.png`) ?? undefined,
  },

  // Goalkeeper
  [PlayingStyles.OFFENSIVE_KEEPER]: {
    key: PlayingStyles.OFFENSIVE_KEEPER,
    exemplar: 'Manuel Neuer',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/offensive_keeper.png`) ?? undefined,
  },
  [PlayingStyles.DEFENSIVE_KEEPER]: {
    key: PlayingStyles.DEFENSIVE_KEEPER,
    exemplar: 'Gianluigi Buffon',
    imageUrl: mediaAsset(`${playingStyleMediaPath}/defensive_keeper.png`) ?? undefined,
  },
};

/** Initials for the crest shown in place of a licensed photograph. */
export function exemplarInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
