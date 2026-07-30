import { cn } from '@/lib/utils';

/** Inline SVG mark — a pin over a pitch. No image request, scales cleanly, themable. */
export function FotSpotMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('shrink-0', className)} role="img" aria-label="FotSpot">
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M16 7c-3.6 0-6.5 2.9-6.5 6.5 0 4.6 5.4 10.2 6.1 10.9a.6.6 0 0 0 .8 0c.7-.7 6.1-6.3 6.1-10.9C22.5 9.9 19.6 7 16 7Z"
        className="fill-primary-foreground"
        opacity="0.95"
      />
      <circle cx="16" cy="13.4" r="2.6" className="fill-primary" />
    </svg>
  );
}
