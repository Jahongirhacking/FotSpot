import { sanitizeArticle } from '@/lib/blog';

/**
 * The article, as the API rendered it.
 *
 * The only place blog HTML reaches the DOM, and it goes through the same
 * allow-list the API rendered against — a Server Component, so the HTML is
 * in the response a crawler reads, not assembled after the fact. The
 * typography is the `.article-body` block in globals.css: a measured column,
 * generous leading, headings that step down from the page's H1.
 */
export function ArticleBody({ html }: { html: string }) {
  const clean = sanitizeArticle(html);
  if (!clean) return null;
  return <div className="article-body" dangerouslySetInnerHTML={{ __html: clean }} />;
}
