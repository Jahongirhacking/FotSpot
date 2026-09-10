'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Check, Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { BlogCategory } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';

/**
 * The sections the blog is filed under, edited in place: a name, and the
 * address the API makes from it unless one is typed. Removing a category
 * leaves its posts in place, without a label — the API's rule, said here so
 * the confirm is honest.
 */
export function CategoryManager({ initial }: { initial: BlogCategory[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [rows, setRows] = React.useState(initial);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState({ name: '', slug: '', description: '' });
  const [error, setError] = React.useState<string | null>(null);

  const [synced, setSynced] = React.useState(initial);
  if (initial !== synced) {
    setSynced(initial);
    setRows(initial);
  }

  const save = useMutation({
    mutationFn: (input: { id?: string; name: string; slug: string; description: string }) =>
      browserFetch<BlogCategory>(
        input.id ? `/blog/admin/categories/${input.id}` : '/blog/admin/categories',
        {
          method: input.id ? 'PATCH' : 'POST',
          body: {
            name: input.name.trim(),
            ...(input.slug.trim() ? { slug: input.slug.trim() } : {}),
            description: input.description,
          },
        },
      ),
    onSuccess: (saved, input) => {
      setRows((current) =>
        input.id
          ? current.map((row) => (row.id === saved.id ? { ...row, ...saved } : row))
          : [...current, saved],
      );
      setAdding(false);
      setEditing(null);
      setError(null);
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => browserFetch(`/blog/admin/categories/${id}`, { method: 'DELETE' }),
    onSuccess: (_result, id) => {
      setRows((current) => current.filter((row) => row.id !== id));
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const begin = (row?: BlogCategory) => {
    setDraft({ name: row?.name ?? '', slug: row?.slug ?? '', description: row?.description ?? '' });
    setEditing(row?.id ?? null);
    setAdding(!row);
    setError(null);
  };

  const form = (id?: string) => (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.name.trim()) return;
        save.mutate({ id, ...draft });
      }}
    >
      <Input
        value={draft.name}
        onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
        placeholder={t.blog.categoryName}
        aria-label={t.blog.categoryName}
        autoFocus
        maxLength={60}
      />
      <Input
        value={draft.slug}
        onChange={(event) => setDraft((d) => ({ ...d, slug: event.target.value }))}
        placeholder={t.blog.categorySlug}
        aria-label={t.blog.categorySlug}
        maxLength={60}
      />
      <Input
        value={draft.description}
        onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))}
        placeholder={t.blog.categoryDescription}
        aria-label={t.blog.categoryDescription}
        maxLength={300}
      />
      <div className="flex gap-2">
        <Button size="sm" type="submit" loading={save.isPending} disabled={!draft.name.trim()}>
          <Check aria-hidden /> {t.common.save}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          onClick={() => begin()}
          aria-label={t.common.cancel}
        >
          <X aria-hidden />
        </Button>
      </div>
    </form>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Tags className="text-primary size-4" aria-hidden /> {t.blog.manageCategories}
        </CardTitle>
        <CardDescription>{t.blog.manageCategoriesHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}

        {rows.length === 0 && !adding && (
          <p className="text-muted text-sm">{t.blog.noCategories}</p>
        )}

        <ul className="divide-border divide-y">
          {rows.map((row) => (
            <li key={row.id} className="py-2">
              {editing === row.id ? (
                form(row.id)
              ) : (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{row.name}</p>
                    <p className="text-muted truncate text-xs">
                      /{row.slug}
                      {typeof row.postCount === 'number' ? ` · ${row.postCount}` : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t.common.edit}
                    onClick={() => begin(row)}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t.common.delete}
                    loading={remove.isPending && remove.variables === row.id}
                    onClick={() => {
                      if (window.confirm(t.blog.confirmDeleteCategory)) remove.mutate(row.id);
                    }}
                  >
                    <Trash2 className="text-danger" aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {adding ? (
          form()
        ) : (
          <Button size="sm" variant="outline" onClick={() => begin()}>
            <Plus aria-hidden /> {t.blog.newCategory}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
