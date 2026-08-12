import type { MediaCategory } from '@/lib/api/types';
import { MEDIA_CONFIGURED, mediaAsset } from '@/lib/media-url';

/**
 * Short vertical demonstrations of what each category wants filmed.
 *
 * ## Why video and not more text
 *
 * `ClipTips` already says what to show in words, and words are where the
 * misunderstanding survives: "show your first touch" is read differently by a
 * thirteen-year-old and by the coach who will watch the result. Ten seconds of
 * somebody doing it correctly removes the ambiguity, and it removes it in every
 * language at once (§1.17) — which matters more here than anywhere, since the
 * clip is the evidence the whole card rests on.
 *
 * ## 9:16, because that is the phone they are holding
 *
 * The tutorials are shot in the aspect the player will film in. A landscape
 * demonstration teaches the wrong framing by example, and framing is the single
 * most common reason a clip comes back unusable.
 *
 * ## The URLs come from the media bucket, not the repo
 *
 * Same arrangement as the playing-style images: `NEXT_PUBLIC_MEDIA_URL` points at
 * the bucket, and the files live there rather than in `public/`. Video in the
 * repository would bloat every clone and every deploy for assets that change on
 * a different schedule from the code.
 *
 * A category with no file yet simply shows no tutorial — `TutorialsDialog`
 * renders what exists, so these can land one at a time without a code change.
 */
export interface ClipTutorial {
  category: MediaCategory;
  /** Vertical 9:16 source. */
  src: string;
  /** Still frame, so the list does not fetch every video to draw itself. */
  poster?: string;
}

const tutorialPath = 'videos/tutorials';

const CATEGORIES: MediaCategory[] = [
  'PACE',
  'DRIBBLING',
  'PASSING',
  'FINISHING',
  'PHYSICAL',
  'TECHNIQUE',
  'MATCH_HIGHLIGHTS',
];

const getTutorialPath = (category: MediaCategory) => {
  switch (category) {
    case 'PACE':
      return 'tutorial_dribbling.mp4';
    case 'DRIBBLING':
      return 'tutorial_dribbling.mp4';
    case 'PASSING':
      return 'tutorial_passing.mp4';
    case 'FINISHING':
      return 'tutorial_shooting.mp4';
    case 'PHYSICAL':
      return 'tutorial_dribbling.mp4';
  }
};

/**
 * One entry per category, in the order the uploader lists them.
 *
 * Built rather than hand-written so a category added to the enum cannot be
 * silently left out of the tutorials — it appears with a predictable URL, and
 * the file either exists in the bucket or the entry renders as unavailable.
 */
export const CLIP_TUTORIALS: ClipTutorial[] = CATEGORIES.map((category) => {
  const slug = category.toLowerCase();
  return {
    category,
    src: mediaAsset(`${tutorialPath}/${slug}.mp4`) ?? '',
    poster: mediaAsset(`${tutorialPath}/${slug}.jpg`) ?? undefined,
  };
});

export function tutorialFor(category: MediaCategory): ClipTutorial | undefined {
  return CLIP_TUTORIALS.find((tutorial) => tutorial?.category === category);
}

/** False when no bucket is configured, so the button can stay hidden. */
export const TUTORIALS_AVAILABLE = MEDIA_CONFIGURED;
