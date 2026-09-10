import * as sanitizeHtml from 'sanitize-html';

/**
 * The blog's Markdown, rendered to the HTML a reader gets.
 *
 * ## A deliberately small dialect
 *
 * What an editor writes for a football blog is headings, paragraphs,
 * emphasis, links, pictures, lists, a quote and a rule — and that is the
 * whole dialect: `#`/`##`/`###` headings, `**bold**`, `*italic*`,
 * `[text](url)`, `![alt](url)`, `-` and `1.` lists, `>` quotes, `---`,
 * `` `code` ``, and a YouTube address alone on a line, which becomes the
 * player. No tables, no raw HTML, no footnotes. Written here rather
 * than pulled from a package for the same reason the trial note's subset is
 * (`common/rich-text.util.ts`): the output is stored and served to everyone,
 * and a rendering that changes with a dependency's next release is a blog
 * whose old articles silently change.
 *
 * ## Headings are demoted
 *
 * The page's H1 is the title, so a `#` in the body becomes an `<h2>` and
 * `##` an `<h3>`: one H1 per page, the structure a crawler expects (README
 * §1.16), without asking the editor to remember which level to start at.
 *
 * ## Sanitised on the way out
 *
 * The renderer escapes text, but the result still passes through
 * `sanitize-html` with a fixed allow-list, so no path — a crafted link, an
 * odd Unicode trick — puts a script into a page every visitor reads.
 */

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'a',
  'img',
  'figure',
  'figcaption',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'hr',
  'iframe',
];

/**
 * The one host an `<iframe>` may point at, and it is the privacy-enhanced
 * one: no YouTube cookies are set until the reader presses play.
 */
export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

/**
 * A YouTube video id from any of the addresses people paste — watch, short
 * `youtu.be`, Shorts, an existing embed — or null for anything else.
 * Exact hosts only: `notyoutube.com/watch?v=` is somebody else's site.
 */
export function youtubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.replace(/^www\.|^m\./, '');
  const valid = (id: string | null | undefined) =>
    id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  if (host === 'youtu.be') return valid(parsed.pathname.slice(1).split('/')[0]);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') return valid(parsed.searchParams.get('v'));
    const path = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(parsed.pathname);
    if (path) return valid(path[1]);
  }
  return null;
}

/** The player for one video, sized by CSS to the article's width. */
function youtubePlayer(id: string): string {
  return (
    `<figure class="video"><iframe src="${YOUTUBE_EMBED_ORIGIN}/embed/${id}" ` +
    'title="YouTube video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
    'allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></figure>'
  );
}

export function sanitizeBlogHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'loading'],
      figure: ['class'],
      iframe: ['src', 'title', 'loading', 'allow', 'allowfullscreen', 'referrerpolicy'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    // An iframe is a window onto another site; only the YouTube player fits.
    allowedIframeHostnames: ['www.youtube-nocookie.com'],
    allowedClasses: { figure: ['video'] },
    // A frame whose address was refused is left empty by the host filter;
    // an empty frame is a grey box on the page, so it goes entirely.
    exclusiveFilter: (frame: { tag: string; attribs: Record<string, string> }) =>
      frame.tag === 'iframe' && !frame.attribs.src,
    // Only the internal links keep the reader in the tab; everything else
    // opens beside the article and carries no handle back to it.
    transformTags: {
      a: (tagName: string, attribs: Record<string, string>) => {
        const href = attribs.href ?? '';
        const internal = href.startsWith('/') && !href.startsWith('//');
        const kept: Record<string, string> = internal
          ? { href }
          : { href, target: '_blank', rel: 'noopener noreferrer' };
        return { tagName, attribs: kept };
      },
      img: (tagName: string, attribs: Record<string, string>) => ({
        tagName,
        attribs: { src: attribs.src ?? '', alt: attribs.alt ?? '', loading: 'lazy' },
      }),
    },
  });
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `**bold**`, `*italic*`, `` `code` ``, `![alt](src)`, `[text](href)` — inside one line. */
function inline(text: string): string {
  let out = '';
  let rest = text;
  const pattern =
    /(!\[([^\]]*)\]\(([^)\s]+)\))|(\[([^\]]+)\]\(([^)\s]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/;
  for (;;) {
    const match = pattern.exec(rest);
    if (!match) {
      out += escape(rest);
      break;
    }
    out += escape(rest.slice(0, match.index));
    if (match[1]) out += `<img src="${escape(match[3])}" alt="${escape(match[2])}">`;
    else if (match[4]) out += `<a href="${escape(match[6])}">${inline(match[5])}</a>`;
    else if (match[7]) out += `<code>${escape(match[8])}</code>`;
    else if (match[9]) out += `<strong>${inline(match[10])}</strong>`;
    else if (match[11]) out += `<em>${inline(match[12])}</em>`;
    rest = rest.slice(match.index + match[0].length);
  }
  return out;
}

export function renderBlogMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  let quote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      html.push(
        `<${list.tag}>${list.items.map((item) => `<li>${item}</li>`).join('')}</${list.tag}>`,
      );
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      html.push(`<blockquote><p>${quote.map(inline).join('<br>')}</p></blockquote>`);
      quote = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === '') {
      flushAll();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+?)\s*#*$/.exec(line);
    if (heading) {
      flushAll();
      // Demoted: the title is the page's H1.
      const level = Math.min(heading[1].length + 1, 4);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushAll();
      html.push('<hr>');
      continue;
    }

    // A YouTube address on its own line is the video itself, not a link to it.
    const video = /^<?(https?:\/\/\S+)>?$/.exec(line.trim());
    const videoId = video ? youtubeVideoId(video[1]) : null;
    if (videoId) {
      flushAll();
      html.push(youtubePlayer(videoId));
      continue;
    }

    // A picture on its own line is a figure, with the alt as its caption.
    const figure = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line.trim());
    if (figure) {
      flushAll();
      const alt = escape(figure[1]);
      html.push(
        `<figure><img src="${escape(figure[2])}" alt="${alt}">${
          alt ? `<figcaption>${alt}</figcaption>` : ''
        }</figure>`,
      );
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      flushQuote();
      const tag = bullet ? 'ul' : 'ol';
      const text = (bullet ?? numbered)![1];
      if (!list || list.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list.items.push(inline(text));
      continue;
    }

    const quoted = /^>\s?(.*)$/.exec(line);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(quoted[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }
  flushAll();

  return sanitizeBlogHtml(html.join('\n'));
}

/** Words at two hundred a minute, rounded up, never zero. */
export function readingMinutes(markdown: string): number {
  const words = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#>*`_\-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

/** The text alone — for a search index, a fallback description, a length check. */
export function markdownToPlainText(markdown: string): string {
  return sanitizeHtml(renderBlogMarkdown(markdown), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}
