'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Flag, ShieldOff, UserX, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Page } from '@/lib/api/client';
import type { Report } from '@/lib/api/resources';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { initials, relativeTime } from '@/lib/utils';

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
      restrictScout,
    }: {
      id: string;
      status: 'RESOLVED' | 'DISMISSED';
      removeMedia?: boolean;
      restrictScout?: boolean;
    }) =>
      browserFetch(`/moderation/reports/${id}/resolve`, {
        method: 'PATCH',
        body: { status, resolutionNote: notes[id] || undefined, removeMedia, restrictScout },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports'] }),
    onError: (err: Error) => setError(err.message),
  });

  if (!reports || reports.length === 0) {
    return (
      <EmptyState icon={ShieldOff} title={t.admin.noReports} description={t.admin.noReportsHint} />
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}

      {reports.map((report) => (
        <Card key={report.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  report.type === 'MEDIA' || report.type === 'RECOMMENDATION'
                    ? 'warning'
                    : 'neutral'
                }
              >
                {report.type === 'RECOMMENDATION'
                  ? t.admin.recommendationReport
                  : report.type.toLowerCase()}
              </Badge>
              <span className="text-muted text-xs">{relativeTime(report.createdAt)}</span>
              {report.reporter && (
                <span className="text-muted text-xs">
                  {t.admin.reportedBy}:{' '}
                  {[report.reporter.firstName, report.reporter.lastName]
                    .filter(Boolean)
                    .join(' ') || report.reporter.id.slice(0, 8)}
                </span>
              )}
            </div>

            <p className="text-sm">
              <Flag className="text-danger mr-1 inline size-3.5 align-[-2px]" aria-hidden />
              {report.reason}
            </p>

            {report.targetRecommendation ? (
              <ReportedRecommendation recommendation={report.targetRecommendation} />
            ) : (
              <p className="text-muted font-mono text-xs">
                {report.targetUserId ??
                  report.targetMediaId ??
                  report.targetAcademyId ??
                  report.targetCoachId ??
                  ''}
              </p>
            )}

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
              {report.targetRecommendation ? (
                <>
                  {/* Skip: the report is read and closed, the text stays up. */}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: report.id, status: 'DISMISSED' })}
                  >
                    <Check aria-hidden /> {t.admin.skipReport}
                  </Button>
                  {/* Restrict: about the scout, not the row — see the backend. An
                      already restricted scout needs no second decision. */}
                  {report.targetRecommendation.scout.restrictedAt ? (
                    <Button
                      size="sm"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ id: report.id, status: 'RESOLVED' })}
                    >
                      <Check aria-hidden /> {t.admin.resolve}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={resolve.isPending}
                      onClick={() => {
                        if (window.confirm(t.admin.confirmRestrictScout)) {
                          resolve.mutate({
                            id: report.id,
                            status: 'RESOLVED',
                            restrictScout: true,
                          });
                        }
                      }}
                    >
                      <UserX aria-hidden /> {t.admin.restrictScout}
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  size="sm"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate({ id: report.id, status: 'RESOLVED' })}
                >
                  <Check aria-hidden /> {t.admin.resolve}
                </Button>
              )}

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

              {!report.targetRecommendation && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate({ id: report.id, status: 'DISMISSED' })}
                >
                  <X aria-hidden /> {t.admin.dismiss}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * The thing being judged: who wrote it, and the exact words. Quoted verbatim
 * — a moderator restricting somebody must be reading the text the reporter
 * read, not a trimmed or reflowed version of it.
 */
function ReportedRecommendation({
  recommendation,
}: {
  recommendation: NonNullable<Report['targetRecommendation']>;
}) {
  const { t } = useI18n();
  const { scout } = recommendation;
  const name = [scout.firstName, scout.lastName].filter(Boolean).join(' ') || scout.id.slice(0, 8);

  return (
    <div className="bg-surface-2 space-y-2 rounded-xl p-3">
      <div className="flex items-center gap-2">
        <Avatar
          src={scout.avatarUrl}
          fallback={initials(scout.firstName, scout.lastName)}
          className="size-8"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-muted text-xs">{relativeTime(recommendation.createdAt)}</p>
        </div>
        {scout.restrictedAt && <Badge variant="danger">{t.admin.scoutRestricted}</Badge>}
      </div>
      <p className="text-muted text-xs uppercase">{t.admin.reportedText}</p>
      <blockquote className="border-danger/60 border-l-2 pl-3 text-sm whitespace-pre-wrap">
        {recommendation.note ?? <span className="text-muted italic">{t.admin.noReportedText}</span>}
      </blockquote>
    </div>
  );
}
