import type { Dictionary } from '@/lib/i18n';

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

export const PLAYING_STYLE_INFO: Record<string, PlayingStyleInfo> = {
  // Forward
  POACHER: {
    key: 'POACHER',
    exemplar: 'Filippo Inzaghi',
    imageUrl: '/players/filippo-inzaghi-efhub.png',
  },
  TARGET_MAN: {
    key: 'TARGET_MAN',
    exemplar: 'Erling Haaland',
    imageUrl: '/players/erling-haaland-efhub.png',
  },
  DEEP_LYING_FORWARD: {
    key: 'DEEP_LYING_FORWARD',
    exemplar: 'Cristiano Ronaldo',
    imageUrl: '/players/cristiano-ronaldo-efhub.png',
  },
  WIDE_THREAT: {
    key: 'WIDE_THREAT',
    exemplar: 'Mohamed Salah',
    imageUrl: '/players/mohamed-salah-efhub.png',
  },

  // Midfield
  BOX_TO_BOX: {
    key: 'BOX_TO_BOX',
    exemplar: 'Steven Gerrard',
    imageUrl: '/players/steven-gerrard-efhub.png',
  },
  PLAYMAKER: {
    key: 'PLAYMAKER',
    exemplar: 'Kevin De Bruyne',
    imageUrl: '/players/kevin-de-bruyne-efhub.png',
  },
  DESTROYER: {
    key: 'DESTROYER',
    exemplar: "N'Golo Kanté",
    imageUrl: '/players/n-golo-kante-efhub.png',
  },
  ORCHESTRATOR: {
    key: 'ORCHESTRATOR',
    exemplar: 'Sergio Busquets',
    imageUrl: '/players/sergio-busquets-efhub.png',
  },

  // Defence
  BALL_PLAYING_DEFENDER: {
    key: 'BALL_PLAYING_DEFENDER',
    exemplar: 'Virgil van Dijk',
    imageUrl: '/players/virgil-van-dijk-efhub.png',
  },
  STOPPER: {
    key: 'STOPPER',
    exemplar: 'Abduqodir Husanov',
    imageUrl: '/players/abdukodir-khusanov-efhub.png',
  },
  OVERLAPPING_FULL_BACK: {
    key: 'OVERLAPPING_FULL_BACK',
    exemplar: 'Marcelo',
    imageUrl: '/players/marcelo-efhub.png',
  },
  SWEEPER: {
    key: 'SWEEPER',
    exemplar: 'Franco Baresi',
    imageUrl: '/players/franco-baresi-efhub.png',
  },

  // Goalkeeper
  OFFENSIVE_KEEPER: {
    key: 'OFFENSIVE_KEEPER',
    exemplar: 'Manuel Neuer',
    imageUrl: '/players/manuel-neuer-efhub.png',
  },
  DEFENSIVE_KEEPER: {
    key: 'DEFENSIVE_KEEPER',
    exemplar: 'Gianluigi Buffon',
    imageUrl: '/players/gianluigi-buffon-efhub.png',
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
