import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional classes, letting later Tailwind utilities win over earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Age in whole years at `at` (default: now). Used for age bands and the §11.1 minor check. */
export function ageFrom(birthDate: string | Date, at: Date = new Date()): number {
  const born = new Date(birthDate);
  let age = at.getFullYear() - born.getFullYear();
  const monthDelta = at.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && at.getDate() < born.getDate())) age--;
  return age;
}

/**
 * Age band per README §21.2 — attribute bars and comparisons are only ever made
 * within a band, never across.
 */
export function ageBand(birthDate: string | Date): 'U12' | 'U14' | 'U16' | 'U18' | 'Senior' {
  const age = ageFrom(birthDate);
  if (age < 12) return 'U12';
  if (age < 14) return 'U14';
  if (age < 16) return 'U16';
  if (age < 18) return 'U18';
  return 'Senior';
}

/** Turn a SCREAMING_SNAKE enum into readable text: DEEP_LYING_FORWARD -> Deep Lying Forward. */
export function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Date and time on the 24-hour clock.
 *
 * `en-GB` for the same reason the date pickers carry `lang="en-GB"`: nobody
 * arranging a football session here writes half past two as 2:30 PM, and a
 * notification about a trial should read the way the trial was written.
 */
export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function relativeTime(value: string | Date): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function initials(first?: string | null, last?: string | null): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?';
}
