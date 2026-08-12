import { BadRequestException } from '@nestjs/common';

/**
 * The four platforms an academy may link to, and the hosts that count as each.
 *
 * ## Why hosts and not "is it a URL"
 *
 * Naming four platforms is a product decision — the point is that an academy's
 * page shows those four and nothing else. A validator that accepts any https
 * address makes the restriction decorative: `instagramUrl` would happily hold a
 * link to anywhere, and the icon beside it would then be a lie about where the
 * reader is being sent. Clicking an Instagram glyph and landing somewhere else
 * is the shape of a phishing link, and this page is edited by whoever holds a
 * manager account.
 *
 * Subdomains are matched by suffix (`www.facebook.com`, `m.youtube.com`), and
 * the short domains each platform actually issues are listed where they exist —
 * `t.me` is the canonical Telegram link and `youtu.be` is what the share sheet
 * produces.
 *
 * Pure and DI-free (backend/CLAUDE.md §2), so the parsing is unit-testable
 * without a Nest container.
 */
export const SOCIAL_HOSTS = {
  telegramUrl: ['t.me', 'telegram.me', 'telegram.org'],
  facebookUrl: ['facebook.com', 'fb.com', 'fb.me'],
  instagramUrl: ['instagram.com', 'instagr.am'],
  youtubeUrl: ['youtube.com', 'youtu.be'],
} as const;

export type SocialField = keyof typeof SOCIAL_HOSTS;

export const SOCIAL_FIELDS = Object.keys(SOCIAL_HOSTS) as SocialField[];

/**
 * Normalises one link, or throws with the platform named.
 *
 * An empty string clears the field — that is how a manager removes a link, and
 * treating it as invalid would leave them unable to.
 *
 * Only `http(s)` is accepted. `javascript:` and `data:` are the reason: these
 * values end up in an `href` on a public page, and a scheme check at the edge is
 * the one place it cannot be forgotten later.
 */
export function normaliseSocialUrl(field: SocialField, value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;

  // A bare "t.me/fotspot" is what somebody pastes from a phone; give it a scheme
  // rather than refusing something whose meaning is unambiguous.
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new BadRequestException(`That ${platformName(field)} link is not a valid address`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException(`A ${platformName(field)} link must start with https://`);
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const allowed = SOCIAL_HOSTS[field];
  const matches = allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));

  if (!matches) {
    throw new BadRequestException(
      `That does not look like a ${platformName(field)} link — expected ${allowed.join(' or ')}`,
    );
  }

  // Rebuilt from the parsed URL rather than stored as typed: this drops
  // fragments and normalises the host, so two spellings of the same page are
  // stored the same way.
  return `https://${host}${url.pathname === '/' ? '' : url.pathname}${url.search}`;
}

function platformName(field: SocialField): string {
  return field.replace(/Url$/, '').replace(/^./, (char) => char.toUpperCase());
}
