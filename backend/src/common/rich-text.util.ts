// Namespace import, not a default one: this package has no tsconfig
// `esModuleInterop`, so `import x from` compiles to `require(...).default`,
// which is undefined for a CommonJS module that exports the function itself.
import * as sanitizeHtml from 'sanitize-html';

/**
 * The tags an academy may use in a player-facing note.
 *
 * Deliberately short. A note says what to bring, where to be and who to ask for
 * — that is emphasis, lists and the occasional link, and nothing else. Every tag
 * added here is a tag somebody has to reason about the next time this file is
 * read, so the list grows only when a real note needed something it did not have.
 *
 * No images and no iframes: both fetch from a third party at render time, which
 * turns a note into a way of tracking which families opened it.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'h3',
  'h4',
  'blockquote',
  'code',
  'a',
];

/**
 * `sanitize-html` rather than DOMPurify on this side.
 *
 * The client uses DOMPurify, which is what the browser wants. On the server
 * DOMPurify needs a DOM, and the isomorphic wrapper pulls an ESM-only dependency
 * that this package's Jest transform cannot parse — so the sanitiser would be
 * the one thing in the codebase no test could reach. `sanitize-html` is CJS, does
 * the same job against the same allow-list, and stays testable.
 */

/**
 * Clean HTML written by an academy before it is stored.
 *
 * **This is the security boundary.** The client sanitises too, but that is a
 * convenience for the person typing — anybody can post to this API without ever
 * loading the client, so a note is only as safe as what happens here. Sanitising
 * on write rather than on read means a row in the database cannot hold a script
 * tag at all, and every existing reader is safe without being changed.
 *
 * Returns null for anything with no text in it, so an empty editor stores a null
 * rather than `"<p></p>"` — which would render as a blank note the player is
 * invited to read.
 */
export function sanitizeRichText(html: string | null | undefined): string | null {
  if (!html) return null;

  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
    // Anything else — `javascript:`, `data:` — is dropped with the attribute.
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    // A link out of a note opens away from the page and cannot reach back
    // through `window.opener`.
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  });

  // `<p><br></p>` and friends are "empty" to a reader even though they are not
  // an empty string, so emptiness is judged on the text, not the markup.
  const text = clean
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length > 0 ? clean : null;
}

/**
 * The same note as plain text, for places that cannot render markup.
 *
 * Notifications are the case that matters: their payload is read as a string and
 * shown as one, so HTML tags would arrive at a family's phone as literal angle
 * brackets. This is not a security measure — `sanitizeRichText` has already run
 * — it is a rendering one.
 */
export function richTextToPlain(html: string | null | undefined): string {
  if (!html) return '';
  return (
    html
      .replace(/<li[^>]*>/gi, '\n• ')
      // `</li>` deliberately absent: the next `<li>` already opens a line, and
      // closing one too put a blank line between every bullet.
      .replace(/<\/(p|div|h3|h4|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
