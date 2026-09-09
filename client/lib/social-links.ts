import type * as React from 'react';
import { AtSign, Link2, Send, Video } from 'lucide-react';
import type { PlayerSocialLinks } from '@/lib/api/types';

/**
 * The four places a player may link to, in the order the profile lists them.
 *
 * The labels are the platforms' own names and are not translated: "Instagram"
 * is "Instagram" in every language the app speaks. `hint` is what somebody
 * pastes from a phone, and the API accepts it with or without the scheme.
 */
export const SOCIAL_PLATFORMS: readonly {
  field: keyof PlayerSocialLinks;
  label: string;
  hint: string;
  /** This lucide build ships no brand glyphs, so each gets the nearest plain one. */
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { field: 'instagramUrl', label: 'Instagram', hint: 'instagram.com/username', icon: AtSign },
  { field: 'telegramUrl', label: 'Telegram', hint: 't.me/username', icon: Send },
  { field: 'youtubeUrl', label: 'YouTube', hint: 'youtube.com/@channel', icon: Video },
  {
    field: 'transfermarktUrl',
    label: 'Transfermarkt',
    hint: 'transfermarkt.com/…/profil/spieler/…',
    icon: Link2,
  },
];
