import { sanitizeNote, noteIsEmpty } from '@/lib/rich-text';
import { cn } from '@/lib/utils';

/**
 * A trial's note, as the player reads it.
 *
 * ## The one place this app hands raw HTML to the DOM
 *
 * `dangerouslySetInnerHTML` is used deliberately and exactly here. Everything it
 * receives has been sanitised twice: once by the server before it was stored
 * (`sanitizeRichText`, which is the boundary that actually protects anybody) and
 * again by `sanitizeNote` on the line below, so a note written before that rule
 * existed, or fetched from anywhere else, still cannot introduce a script.
 *
 * Because it is the only such place, it is also the only file to audit when the
 * allow-list changes — which is why every caller renders notes through this
 * component rather than reaching for `dangerouslySetInnerHTML` itself.
 *
 * Not a Client Component: it holds no state and takes no events, so it renders
 * on the server wherever the caller is a Server Component, and the browser never
 * has to run the sanitiser at all.
 */
export function TrialNote({
  html,
  className,
}: {
  html: string | null | undefined;
  className?: string;
}) {
  if (noteIsEmpty(html)) return null;

  return (
    <div
      className={cn(
        // The tags the allow-list permits, styled here because the markup
        // arrives without classes of its own.
        'text-sm leading-relaxed',
        '[&_p]:mb-2 [&_p:last-child]:mb-0',
        '[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:mb-0.5',
        '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-semibold',
        '[&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:font-medium',
        '[&_blockquote]:border-border [&_blockquote]:text-muted [&_blockquote]:mb-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3',
        '[&_code]:bg-surface-2 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
        '[&_a]:text-primary [&_a]:underline',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitizeNote(html) }}
    />
  );
}
