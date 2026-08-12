'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/components/layout/I18nProvider';

export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  if (lastPage <= 1) return null;

  function goTo(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params?.set('page', String(nextPage));
    router.push(`?${params?.toString()}`);
  }

  return (
    <nav className="flex items-center justify-between gap-3" aria-label={t.common.page}>
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
        <ChevronLeft aria-hidden />
        <span className="hidden sm:inline">{t.common.previous}</span>
      </Button>
      <p className="text-muted text-sm" aria-live="polite">
        {t.common.page} {page} {t.common.of} {lastPage}
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= lastPage}
        onClick={() => goTo(page + 1)}
      >
        <span className="hidden sm:inline">{t.common.next}</span>
        <ChevronRight aria-hidden />
      </Button>
    </nav>
  );
}
