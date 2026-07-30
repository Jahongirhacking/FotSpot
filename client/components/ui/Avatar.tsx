import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Initials-only avatar. There is no user photo upload in the MVP, and for minor
 * profiles a photo is guardian-consented content (README §11.1) — so initials are
 * the correct default rather than a placeholder that implies a missing image.
 */
export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'size-8 text-xs',
    md: 'size-10 text-sm',
    lg: 'size-14 text-base',
  };

  return (
    <span
      className={cn(
        'bg-primary/15 text-primary grid shrink-0 place-items-center rounded-full font-semibold',
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {name}
    </span>
  );
}
