'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useI18n } from '@/components/layout/I18nProvider';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

/**
 * The search box on the listing. The query lives in the URL (`?q=`), so a
 * search is a page a reader can share and a crawler can ignore — the
 * canonical stays `/blog`. Submitting navigates; nothing fetches on
 * keystroke, since the API pages the results server-side.
 */
export function BlogSearch({ initial = '' }: { initial?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = React.useState(initial);

  const go = (q: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    if (q.trim()) params.set('q', q.trim());
    else params.delete('q');
    const query = params.toString();
    router.push(query ? `/blog?${query}` : '/blog');
  };

  return (
    <form
      role="search"
      className="relative w-full sm:max-w-xs"
      onSubmit={(event) => {
        event.preventDefault();
        go(value);
      }}
    >
      <Search
        className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t.blog.searchPlaceholder}
        aria-label={t.blog.search}
        className="pr-9 pl-9"
      />
      {value && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t.common.clear}
          className="absolute top-1/2 right-0.5 size-9 -translate-y-1/2"
          onClick={() => {
            setValue('');
            go('');
          }}
        >
          <X className="size-4" aria-hidden />
        </Button>
      )}
    </form>
  );
}
