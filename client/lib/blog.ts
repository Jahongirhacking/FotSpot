import sanitizeHtml from 'sanitize-html';
import type { BlogPostCard } from '@/lib/api/types';

/**
 * The tags an article body may contain — the same list the API renders to
 * (`backend/src/blog/blog-markdown.util.ts`). Cleaned again here before it
 * reaches the DOM, for the same reason a trial note is: the server is the
 * boundary, and this is the belt to its braces.
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

export function sanitizeArticle(html: string | null | undefined): string {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'loading'],
      figure: ['class'],
      iframe: ['src', 'title', 'loading', 'allow', 'allowfullscreen', 'referrerpolicy'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedIframeHostnames: ['www.youtube-nocookie.com'],
    allowedClasses: { figure: ['video'] },
    // A frame whose address was refused is left empty by the host filter;
    // an empty frame is a grey box on the page, so it goes entirely.
    exclusiveFilter: (frame: { tag: string; attribs: Record<string, string> }) =>
      frame.tag === 'iframe' && !frame.attribs.src,
  });
}

/** `/blog/<slug>` — the one place the address is spelled. */
export const postPath = (post: Pick<BlogPostCard, 'slug'>) => `/blog/${post.slug}`;

/** `/blog?category=<slug>` — the listing narrowed to one category. */
export const categoryPath = (slug: string) => `/blog?category=${encodeURIComponent(slug)}`;

/** The meta description a post gets: its own, or the excerpt trimmed to a result's width. */
export function metaDescriptionFor(post: {
  metaDescription?: string | null;
  excerpt: string;
}): string {
  const text = (post.metaDescription?.trim() || post.excerpt).replace(/\s+/g, ' ').trim();
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}
