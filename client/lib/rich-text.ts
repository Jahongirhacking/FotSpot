import DOMPurify from 'dompurify';

/**
 * The tags a trial note may contain. Mirrors `backend/src/common/rich-text.util.ts`.
 *
 * Kept in step by hand, like every other shape crossing this boundary (see
 * `lib/api/types.ts`). If they drift, the server's list is the one that decides:
 * this one only affects what the person typing sees.
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

const ALLOWED_ATTR = ['href', 'title', 'target', 'rel'];

/**
 * Clean a note before it is sent, and again before it is shown.
 *
 * **Not a security boundary.** The server sanitises on write and that is what
 * actually protects anybody — this runs so the editor cannot save markup the
 * server would silently strip, and so a note rendered from a response is clean
 * even if it somehow predates the server-side rule.
 *
 * Both directions matter because they fail differently: skipping it on the way
 * in means saving something that will not come back the same, and skipping it on
 * the way out means trusting the API completely at the one place we hand raw
 * HTML to the DOM.
 */
export function sanitizeNote(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Every link leaves the app, so none of them may keep a handle back to it.
    ADD_ATTR: ['target', 'rel'],
  });
}

/** Whether a note has anything in it a reader would see. */
export function noteIsEmpty(html: string | null | undefined): boolean {
  if (!html) return true;
  return (
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim().length === 0
  );
}

/**
 * The small markup vocabulary the editor writes, and how it is rendered.
 *
 * A deliberately tiny Markdown subset rather than a WYSIWYG surface. What an
 * academy writes in a trial note is bold, italics, a bullet list and the
 * occasional link — and Markdown for that is something a manager can type
 * directly, read back in the box, and paste from somewhere else without the
 * editor fighting them over invisible formatting.
 */
export function markdownToHtml(markdown: string): string {
  const escaped = markdown.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const inline = (text: string) =>
    text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      // Only http(s) and mailto reach the server's allow-list, so an editor that
      // produced anything else would just be writing links that vanish.
      .replace(
        /\[(.+?)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      );

  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  for (const raw of escaped.split('\n')) {
    const line = raw.trim();

    if (!line) {
      closeList();
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    const heading = /^(#{3,4})\s+(.*)$/.exec(line);
    const quote = /^&gt;\s+(.*)$/.exec(line);

    if (bullet) {
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else if (numbered) {
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(numbered[1])}</li>`);
    } else if (heading) {
      closeList();
      const level = heading[1].length === 3 ? 'h3' : 'h4';
      out.push(`<${level}>${inline(heading[2])}</${level}>`);
    } else if (quote) {
      closeList();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }

  closeList();
  return out.join('');
}

/**
 * Stored HTML back into the markup the editor works in.
 *
 * Needed because the editor is a textarea: reopening a saved note has to put
 * something editable in it, and that something has to round-trip through
 * `markdownToHtml` to the same HTML. Only the tags this file can produce are
 * handled — anything else degrades to its text, which is the honest outcome for
 * markup the editor never wrote.
 */
export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return '';

  return html
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n')
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n')
    .replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, '*$2*')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/(ul|ol)>/gi, '\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
