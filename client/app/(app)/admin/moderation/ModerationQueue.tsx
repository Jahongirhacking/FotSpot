'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ShieldOff, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Page } from '@/lib/api/client';
import type { Report } from '@/lib/api/resources';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { relativeTime } from '@/lib/utils';

export function ModerationQueue({ initial }: { initial: Report[] }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const { data: reports } = useQuery({
    queryKey: ['reports'],
    queryFn: () =>
      browserFetch<Page<Report>>('/moderation/reports/pending').then((page) => page.items),
    initialData: initial,
  });

  const resolve = useMutation({
    mutationFn: ({
      id,
      status,
      removeMedia,
    }: {
      id: string;
      status: 'RESOLVED' | 'DISMISSED';
      removeMedia?: boolean;
    }) =>
      browserFetch(`/moderation/reports/${id}/resolve`, {
        method: 'PATCH',
        body: { status, resolutionNote: notes[id] || undefined, removeMedia },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports'] }),
    onError: (err: Error) => setError(err.message),
  });

  if (!reports || reports.length === 0) {
    return <EmptyState icon={ShieldOff} title={t.admin.noReports} />;
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}

      {reports.map((report) => (
        <Card key={report.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={report.type === 'MEDIA' ? 'warning' : 'neutral'}>
                {report.type.toLowerCase()}
              </Badge>
              <span className="text-muted text-xs">{relativeTime(report.createdAt)}</span>
            </div>

            <p className="text-sm">{report.reason}</p>

            <p className="text-muted font-mono text-xs">
              {report.targetUserId ??
                report.targetMediaId ??
                report.targetAcademyId ??
                report.targetCoachId ??
                ''}
            </p>

            <Field label={t.admin.resolutionNote} htmlFor={`note-${report.id}`}>
              <Input
                id={`note-${report.id}`}
                placeholder={t.placeholders.note}
                value={notes[report.id] ?? ''}
                onChange={(event) =>
                  setNotes((prev) => ({ ...prev, [report.id]: event.target.value }))
                }
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: report.id, status: 'RESOLVED' })}
              >
                <Check aria-hidden /> {t.admin.resolve}
              </Button>

              {/* Only offered for media reports — the backend only acts on
                  removeMedia when the report actually targets media. */}
              {report.targetMediaId && (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={resolve.isPending}
                  onClick={() =>
                    resolve.mutate({ id: report.id, status: 'RESOLVED', removeMedia: true })
                  }
                >
                  <ShieldOff aria-hidden /> {t.admin.removeMedia}
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: report.id, status: 'DISMISSED' })}
              >
                <X aria-hidden /> {t.admin.dismiss}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
