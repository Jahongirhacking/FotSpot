'use client';

import { ArticleBody } from '@/components/blog/ArticleBody';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { LoadingImage } from '@/components/ui/LoadingImage';
import { browserFetch } from '@/lib/api/browser';
import type { SaveBlogPostBody } from '@/lib/api/resources';
import type { AcademyProfile, AdminBlogPost, BlogCategory, BlogPostImage } from '@/lib/api/types';
import { uploadToStorage } from '@/lib/api/upload';
import { LUPO, postPath } from '@/lib/blog';
import { suggestKeywords } from '@/lib/blog-keywords';
import { cn } from '@/lib/utils';
import { useMutation } from '@tanstack/react-query';
import {
  Bold,
  ExternalLink,
  Eye,
  FolderOpen,
  Globe,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { BlogMediaPanel } from './BlogMediaPanel';

/** What the form holds — strings throughout, so an empty box is an empty string. */
interface Draft {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverKey: string;
  coverUrl: string | null;
  coverAlt: string;
  categoryId: string;
  authorAcademyId: string;
  readingMinutes: string;
  featured: boolean;
  seoTitle: string;
  metaDescription: string;
  seoKeywords: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImageKey: string;
  ogImageUrl: string | null;
}

function draftOf(post: AdminBlogPost | null): Draft {
  return {
    title: post?.title ?? '',
    slug: post?.slug ?? '',
    excerpt: post?.excerpt ?? '',
    content: post?.content ?? '',
    coverKey: post?.coverKey ?? '',
    coverUrl: post?.coverUrl ?? null,
    coverAlt: post?.coverAlt ?? '',
    categoryId: post?.categoryId ?? '',
    authorAcademyId: post?.authorAcademyId ?? '',
    readingMinutes: post ? String(post?.readingMinutes) : '',
    featured: post?.featured ?? false,
    seoTitle: post?.seoTitle ?? '',
    metaDescription: post?.metaDescription ?? '',
    seoKeywords: post?.seoKeywords.join(', ') ?? '',
    canonicalUrl: post?.canonicalUrl ?? '',
    ogTitle: post?.ogTitle ?? '',
    ogDescription: post?.ogDescription ?? '',
    ogImageKey: post?.ogImageKey ?? '',
    ogImageUrl: post?.ogImageUrl ?? null,
  };
}

/** A slug the way the API would make it — for the "from title" button, and only that. */
function slugPreview(title: string): string {
  return title
    .toLowerCase()
    .replace(/[ʻʼ'’`´]/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

/**
 * The editor, for a new post and an existing one alike.
 *
 * ## Save is one PATCH of everything
 *
 * A post is one thing, and an editor expects one Save to keep all of it —
 * the SEO fields with the words. Publishing is a separate press, because
 * "keep my draft" and "put this in front of everybody" are different
 * decisions and should not share a button. A new post is created on its
 * first save and the page moves to its own address, so the pictures — which
 * live under the post's id — can be uploaded from then on.
 *
 * ## The slug
 *
 * Empty on a new post and made from the title by the API on the first save.
 * From then on it is only what the admin types: a title edit never changes
 * it, since an address that was shared or indexed has to keep resolving.
 * "From title" fills the box the way the API would, for an admin who wants
 * the new title's address before publishing.
 */
export function PostEditor({
  post,
  categories,
  images,
  academyOptions = [],
}: {
  post: AdminBlogPost | null;
  categories: BlogCategory[];
  images: BlogPostImage[];
  /** Verified academies a post may be signed by; the mascot signs it otherwise. */
  academyOptions?: Pick<AcademyProfile, 'id' | 'name'>[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(post));
  const [tab, setTab] = React.useState<'write' | 'preview'>('write');
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState<'cover' | 'og' | null>(null);
  const contentRef = React.useRef<HTMLTextAreaElement>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  /*
   * Keywords are suggested until the admin touches them.
   *
   * A post that already carries keywords, or a field the admin has typed in,
   * is theirs and is left alone. Otherwise the box shows what the title, the
   * excerpt and the text suggest, live, and that is what is saved — so a post
   * published without a thought for keywords still has them. "Suggest" puts
   * the suggestion back after an edit.
   */
  const [keywordsTouched, setKeywordsTouched] = React.useState(
    () => (post?.seoKeywords.length ?? 0) > 0,
  );
  const suggestedKeywords = React.useMemo(
    () =>
      suggestKeywords({
        title: draft.title,
        excerpt: draft.excerpt,
        content: draft.content,
        category: categories.find((c) => c.id === draft.categoryId)?.name ?? null,
      }).join(', '),
    [draft.title, draft.excerpt, draft.content, draft.categoryId, categories],
  );
  const keywordsValue = keywordsTouched ? draft.seoKeywords : suggestedKeywords;

  const body = (): SaveBlogPostBody => ({
    title: draft.title.trim(),
    ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}),
    excerpt: draft.excerpt.trim(),
    content: draft.content,
    coverKey: draft.coverKey,
    coverAlt: draft.coverAlt,
    categoryId: draft.categoryId,
    authorAcademyId: draft.authorAcademyId,
    readingMinutes: Number(draft.readingMinutes) || 0,
    featured: draft.featured,
    seoTitle: draft.seoTitle,
    metaDescription: draft.metaDescription,
    seoKeywords: keywordsValue
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
    canonicalUrl: draft.canonicalUrl,
    ogTitle: draft.ogTitle,
    ogDescription: draft.ogDescription,
    ogImageKey: draft.ogImageKey,
  });

  const save = useMutation({
    mutationFn: () =>
      post
        ? browserFetch<AdminBlogPost>(`/blog/admin/posts/${post?.id}`, {
            method: 'PATCH',
            body: body(),
          })
        : browserFetch<AdminBlogPost>('/blog/admin/posts', { method: 'POST', body: body() }),
    onSuccess: (saved) => {
      setError(null);
      if (!post) {
        router.replace(`/admin/blog/${saved.id}`);
        return;
      }
      setDraft((current) => ({
        ...draftOf(saved),
        // Keep what is being typed in the boxes the server does not echo differently.
        content: current.content === saved.content ? saved.content : current.content,
      }));
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
    meta: { success: t.blog.saved },
  });

  const publish = useMutation({
    mutationFn: async (next: 'publish' | 'unpublish') => {
      if (!post) throw new Error(t.blog.createdFirst);
      // Save first, so what goes live is what is on screen.
      await browserFetch(`/blog/admin/posts/${post?.id}`, { method: 'PATCH', body: body() });
      return browserFetch<AdminBlogPost>(`/blog/admin/posts/${post?.id}/${next}`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: () => browserFetch(`/blog/admin/posts/${post!.id}`, { method: 'DELETE' }),
    onSuccess: () => router.replace('/admin/blog'),
    onError: (err: Error) => setError(err.message),
    meta: { success: t.blog.deletedToast },
  });

  const upload = async (purpose: 'cover' | 'og', file: File) => {
    if (!post) {
      setError(t.blog.createdFirst);
      return;
    }
    setUploading(purpose);
    try {
      const ticket = await browserFetch<{
        uploadUrl: string;
        storageKey: string;
        publicUrl: string | null;
      }>(`/blog/admin/posts/${post?.id}/images/upload-url`, {
        method: 'POST',
        body: { filename: file.name || 'image.jpg', purpose },
      });
      await uploadToStorage(ticket.uploadUrl, file, {
        blocked: t.blog.uploadFailed,
        rejected: t.blog.uploadFailed,
      });
      const url = URL.createObjectURL(file);
      if (purpose === 'cover')
        setDraft((d) => ({ ...d, coverKey: ticket.storageKey, coverUrl: url }));
      else setDraft((d) => ({ ...d, ogImageKey: ticket.storageKey, ogImageUrl: url }));
      setError(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : t.blog.uploadFailed);
    } finally {
      setUploading(null);
    }
  };

  /** Wraps the selection in the content box — the toolbar's whole job. */
  const wrap = (before: string, after = before, placeholder = '') => {
    const el = contentRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = draft.content.slice(start, end) || placeholder;
    const next =
      draft.content.slice(0, start) + before + selected + after + draft.content.slice(end);
    set('content', next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };
  const prefixLines = (prefix: string) => {
    const el = contentRef.current;
    if (!el) return;
    const start = draft.content.lastIndexOf('\n', el.selectionStart - 1) + 1;
    const end = el.selectionEnd;
    const block = draft.content.slice(start, end);
    const next =
      draft.content.slice(0, start) +
      block
        .split('\n')
        .map((l) => prefix + l)
        .join('\n') +
      draft.content.slice(end);
    set('content', next);
  };

  const published = post?.status === 'PUBLISHED';
  const ready =
    draft.title.trim().length >= 3 &&
    draft.excerpt.trim().length > 0 &&
    draft.content.trim().length > 0;
  const busy = save.isPending || publish.isPending || remove.isPending;

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) save.mutate();
      }}
    >
      {error && <Alert tone="danger">{error}</Alert>}

      {/* The bar: where the post stands, and the three presses. Sticky, so
          Save is never a scroll away on a long article. */}
      <div className="bg-background/90 sticky top-0 z-10 -mx-1 flex flex-col gap-2 rounded-lg px-1 py-2 backdrop-blur sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-2">
          <Badge variant={published ? 'success' : 'warning'}>
            {published ? t.blog.statusPublished : t.blog.statusDraft}
          </Badge>
          {post && published && (
            <Link
              href={postPath(post)}
              target="_blank"
              className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
            >
              {t.blog.viewOnBlog} <ExternalLink className="size-3" aria-hidden />
            </Link>
          )}
          {post && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-danger ml-auto sm:hidden"
              loading={remove.isPending}
              onClick={() => {
                if (window.confirm(t.blog.confirmDelete)) remove.mutate();
              }}
            >
              <Trash2 aria-hidden /> {t.blog.deletePost}
            </Button>
          )}
        </div>
        {/* On a phone the two actions share the row and are thumb-sized; on a
            laptop they sit at the right of the badge as before. */}
        <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:flex-wrap">
          {post && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-danger hidden sm:inline-flex"
              loading={remove.isPending}
              onClick={() => {
                if (window.confirm(t.blog.confirmDelete)) remove.mutate();
              }}
            >
              <Trash2 aria-hidden /> {t.blog.deletePost}
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-9"
            loading={save.isPending}
            disabled={!ready || busy}
          >
            <Save aria-hidden /> {published ? t.blog.save : t.blog.saveDraft}
          </Button>
          {post && !published && (
            <Button
              type="button"
              size="sm"
              className="min-h-11 sm:min-h-9"
              loading={publish.isPending}
              disabled={!ready || busy}
              onClick={() => publish.mutate('publish')}
            >
              <Send aria-hidden /> {t.blog.publish}
            </Button>
          )}
          {post && published && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 sm:min-h-9"
              loading={publish.isPending}
              disabled={busy}
              onClick={() => {
                if (window.confirm(t.blog.confirmUnpublish)) publish.mutate('unpublish');
              }}
            >
              <Undo2 aria-hidden /> {t.blog.unpublish}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ---- The words ---- */}
        <div className="space-y-5">
          <Field label={t.blog.fieldTitle} htmlFor="post-title" required>
            <Input
              id="post-title"
              value={draft.title}
              onChange={(event) => set('title', event.target.value)}
              maxLength={160}
              className="text-lg font-semibold"
              required
            />
          </Field>

          <Field label={t.blog.fieldSlug} htmlFor="post-slug" hint={t.blog.fieldSlugHint}>
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <span className="text-muted shrink-0 text-sm">/blog/</span>
                <Input
                  id="post-slug"
                  value={draft.slug}
                  onChange={(event) => set('slug', event.target.value)}
                  placeholder={slugPreview(draft.title) || 'auto'}
                  maxLength={90}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  className="font-mono text-sm"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => set('slug', slugPreview(draft.title))}
              >
                <RefreshCw aria-hidden /> {t.blog.regenerateSlug}
              </Button>
            </div>
          </Field>

          <Field
            label={t.blog.fieldExcerpt}
            htmlFor="post-excerpt"
            hint={t.blog.fieldExcerptHint}
            required
          >
            <Textarea
              id="post-excerpt"
              value={draft.excerpt}
              onChange={(event) => set('excerpt', event.target.value)}
              rows={3}
              maxLength={400}
              required
            />
          </Field>

          <Field
            label={t.blog.fieldContent}
            htmlFor="post-content"
            hint={t.blog.fieldContentHint}
            required
          >
            <div className="border-border overflow-hidden rounded-lg border">
              <div className="bg-surface-2 flex flex-wrap items-center gap-1 border-b p-1.5">
                <ToolbarButton label="H2" onClick={() => prefixLines('# ')}>
                  <Heading2 aria-hidden />
                </ToolbarButton>
                <ToolbarButton label="Bold" onClick={() => wrap('**', '**', 'bold')}>
                  <Bold aria-hidden />
                </ToolbarButton>
                <ToolbarButton label="Italic" onClick={() => wrap('*', '*', 'italic')}>
                  <Italic aria-hidden />
                </ToolbarButton>
                <ToolbarButton label="Link" onClick={() => wrap('[', '](https://)', 'text')}>
                  <Link2 aria-hidden />
                </ToolbarButton>
                <ToolbarButton label="Image" onClick={() => wrap('![', '](https://)', 'caption')}>
                  <ImageIcon aria-hidden />
                </ToolbarButton>
                <ToolbarButton label="List" onClick={() => prefixLines('- ')}>
                  <List aria-hidden />
                </ToolbarButton>
                <ToolbarButton label="Numbered" onClick={() => prefixLines('1. ')}>
                  <ListOrdered aria-hidden />
                </ToolbarButton>
                <ToolbarButton label="Quote" onClick={() => prefixLines('> ')}>
                  <Quote aria-hidden />
                </ToolbarButton>
                <div role="tablist" className="ml-auto flex gap-1">
                  {(['write', 'preview'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={tab === value}
                      onClick={() => setTab(value)}
                      className={cn(
                        'inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium',
                        tab === value ? 'bg-surface shadow-sm' : 'text-muted',
                      )}
                    >
                      {value === 'preview' && <Eye className="size-3.5" aria-hidden />}
                      {value === 'write' ? t.blog.write : t.blog.preview}
                    </button>
                  ))}
                </div>
              </div>
              {tab === 'write' ? (
                <Textarea
                  ref={contentRef}
                  id="post-content"
                  value={draft.content}
                  onChange={(event) => set('content', event.target.value)}
                  rows={22}
                  className="min-h-[20rem] rounded-none border-0 font-mono text-sm leading-relaxed focus-visible:ring-0 sm:min-h-[28rem]"
                  required
                />
              ) : (
                <div className="min-h-[20rem] p-4 sm:min-h-[28rem] sm:p-5">
                  {post && draft.content === post?.content ? (
                    <ArticleBody html={post?.contentHtml} />
                  ) : (
                    <p className="text-muted text-sm">{t.blog.previewNeedsSave}</p>
                  )}
                </div>
              )}
            </div>
          </Field>

          {/* Body images live beside the editor, not inside it: the editor is a
          form that saves as one row, and an upload is not a field of it. */}
          <BlogMediaPanel postId={post?.id || ''} initialImages={images} />
        </div>

        {/* ---- The side: filing, pictures, SEO ---- */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderOpen className="text-primary size-4" aria-hidden /> {t.blog.filingSection}
              </CardTitle>
              <CardDescription>{t.blog.filingHint}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label={t.blog.fieldCategory} htmlFor="post-category">
                <Select
                  id="post-category"
                  value={draft.categoryId}
                  onChange={(event) => set('categoryId', event.target.value)}
                >
                  <option value="">{t.blog.noCategory}</option>
                  {categories.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t.blog.fieldAuthorName}
                htmlFor="post-author"
                hint={t.blog.fieldAuthorNameHint}
              >
                <Select
                  id="post-author"
                  value={draft.authorAcademyId}
                  onChange={(event) => set('authorAcademyId', event.target.value)}
                >
                  <option value="">{LUPO.name}</option>
                  {academyOptions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t.blog.fieldReadingMinutes}
                htmlFor="post-reading"
                hint={t.blog.fieldReadingMinutesHint}
              >
                <Input
                  id="post-reading"
                  type="number"
                  min={0}
                  max={120}
                  value={draft.readingMinutes}
                  onChange={(event) => set('readingMinutes', event.target.value)}
                />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.featured}
                  onChange={(event) => set('featured', event.target.checked)}
                  className="accent-primary mt-1"
                />
                <span>{t.blog.fieldFeatured}</span>
              </label>
            </CardContent>
          </Card>

          <ImageField
            label={t.blog.fieldCover}
            url={draft.coverUrl}
            uploading={uploading === 'cover'}
            disabled={!post}
            disabledHint={t.blog.createdFirst}
            onPick={(file) => upload('cover', file)}
            onClear={() => setDraft((d) => ({ ...d, coverKey: '', coverUrl: null }))}
          >
            <Field
              label={t.blog.fieldCoverAlt}
              htmlFor="post-cover-alt"
              hint={t.blog.fieldCoverAltHint}
            >
              <Input
                id="post-cover-alt"
                value={draft.coverAlt}
                onChange={(event) => set('coverAlt', event.target.value)}
                maxLength={200}
              />
            </Field>
          </ImageField>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="text-primary size-4" aria-hidden /> {t.blog.seoSection}
              </CardTitle>
              <CardDescription>{t.blog.seoHint}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                label={t.blog.fieldSeoTitle}
                htmlFor="post-seo-title"
                hint={`${draft.seoTitle.length}/70`}
              >
                <Input
                  id="post-seo-title"
                  value={draft.seoTitle}
                  onChange={(event) => set('seoTitle', event.target.value)}
                  maxLength={70}
                  placeholder={draft.title}
                />
              </Field>
              <Field
                label={t.blog.fieldMetaDescription}
                htmlFor="post-meta"
                hint={`${draft.metaDescription.length}/160`}
              >
                <Textarea
                  id="post-meta"
                  value={draft.metaDescription}
                  onChange={(event) => set('metaDescription', event.target.value)}
                  rows={3}
                  maxLength={170}
                  placeholder={draft.excerpt}
                />
              </Field>
              <Field
                label={t.blog.fieldSeoKeywords}
                htmlFor="post-keywords"
                hint={t.blog.fieldSeoKeywordsHint}
              >
                <div className="flex gap-2">
                  <Input
                    id="post-keywords"
                    value={keywordsValue}
                    onChange={(event) => {
                      setKeywordsTouched(true);
                      set('seoKeywords', event.target.value);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    title={t.blog.suggestKeywords}
                    onClick={() => {
                      set('seoKeywords', suggestedKeywords);
                      setKeywordsTouched(false);
                    }}
                  >
                    <RefreshCw aria-hidden /> {t.blog.suggestKeywords}
                  </Button>
                </div>
              </Field>
              <Field
                label={t.blog.fieldCanonicalUrl}
                htmlFor="post-canonical"
                hint={t.blog.fieldCanonicalUrlHint}
              >
                <Input
                  id="post-canonical"
                  type="url"
                  value={draft.canonicalUrl}
                  onChange={(event) => set('canonicalUrl', event.target.value)}
                  placeholder="https://"
                />
              </Field>
              <Field label={t.blog.fieldOgTitle} htmlFor="post-og-title">
                <Input
                  id="post-og-title"
                  value={draft.ogTitle}
                  onChange={(event) => set('ogTitle', event.target.value)}
                  maxLength={90}
                  placeholder={draft.seoTitle || draft.title}
                />
              </Field>
              <Field label={t.blog.fieldOgDescription} htmlFor="post-og-desc">
                <Textarea
                  id="post-og-desc"
                  value={draft.ogDescription}
                  onChange={(event) => set('ogDescription', event.target.value)}
                  rows={2}
                  maxLength={200}
                  placeholder={draft.metaDescription || draft.excerpt}
                />
              </Field>
              <ImageField
                label={t.blog.fieldOgImage}
                hint={t.blog.fieldOgImageHint}
                url={draft.ogImageUrl}
                uploading={uploading === 'og'}
                disabled={!post}
                disabledHint={t.blog.createdFirst}
                onPick={(file) => upload('og', file)}
                onClear={() => setDraft((d) => ({ ...d, ogImageKey: '', ogImageUrl: null }))}
                plain
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="hover:bg-surface text-muted hover:text-foreground grid size-10 place-items-center rounded-md sm:size-8 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

/**
 * One picture: shown when there is one, with Replace and Remove; a file
 * input otherwise. Disabled — with the reason — until the post exists, since
 * the object's key is minted under the post's id.
 */
function ImageField({
  label,
  hint,
  url,
  uploading,
  disabled,
  disabledHint,
  onPick,
  onClear,
  plain = false,
  children,
}: {
  label: string;
  hint?: string;
  url: string | null;
  uploading: boolean;
  disabled: boolean;
  disabledHint: string;
  onPick: (file: File) => void;
  onClear: () => void;
  /** Inside another card already: no card of its own. */
  plain?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const body = (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-muted text-xs">{hint}</p>}
      </div>
      <div className="bg-surface-2 relative aspect-[16/9] w-full overflow-hidden rounded-lg">
        {url ? (
          <LoadingImage src={url} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="text-muted grid size-full place-items-center">
            <ImageIcon className="size-6" aria-hidden />
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = '';
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={uploading}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          title={disabled ? disabledHint : undefined}
        >
          <Upload aria-hidden /> {url ? t.blog.replace : t.blog.upload}
        </Button>
        {url && (
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            <X aria-hidden /> {t.blog.removeImage}
          </Button>
        )}
      </div>
      {disabled && <p className="text-muted text-xs">{disabledHint}</p>}
      {children}
    </div>
  );
  if (plain) return body;
  return (
    <Card>
      <CardContent className="p-4">{body}</CardContent>
    </Card>
  );
}
