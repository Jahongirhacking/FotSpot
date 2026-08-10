import type { PlanTier } from '@/lib/api/resources';
import type { Dictionary } from '@/lib/i18n';

/**
 * The translated name of a tier.
 *
 * Shared rather than duplicated in the two screens that name a plan: the admin
 * console and a user's own settings must agree, and "Bepul" appearing on one
 * screen next to "Free" on the other is exactly the kind of drift a second copy
 * produces.
 *
 * The raw enum value is still shown as a badge on the admin screen — the
 * translation is for reading, the enum is what the API speaks.
 */
export function planLabel(tier: PlanTier, t: Dictionary): string {
  if (tier === 'FREE') return t.plans.free;
  if (tier === 'PRO') return t.plans.pro;
  return t.plans.premium;
}
