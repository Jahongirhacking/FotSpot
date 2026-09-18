'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Alert } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { browserFetch } from '@/lib/api/browser';
import { useMutation } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

const MAX_REASON_LENGTH = 500;

/**
 * Reporting a recommendation's text to moderation.
 *
 * Files a report and nothing more: the recommendation stays exactly as it is
 * until a moderator reads the report, and the server refuses a second open
 * report from the same reader, which the dialog shows as the message it gets
 * back rather than pretending the report went through twice.
 */
export function ReportRecommendationDialog({
  recommendationId,
  open,
  onOpenChange,
}: {
  recommendationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const report = useMutation({
    mutationFn: () =>
      browserFetch('/moderation/reports', {
        method: 'POST',
        body: { type: 'RECOMMENDATION', targetRecommendationId: recommendationId, reason },
      }),
    onSuccess: () => {
      toast.success(t.recommendations.reportSent);
      close(false);
    },
    onError: (problem: Error) => setError(problem.message),
  });

  function close(next: boolean) {
    if (report.isPending) return;
    if (!next) {
      setReason('');
      setError(null);
    }
    onOpenChange(next);
  }

  const ready = reason.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="text-danger size-4" aria-hidden /> {t.recommendations.reportTitle}
          </DialogTitle>
          <DialogDescription>{t.recommendations.reportHint}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label={t.recommendations.reportReason} htmlFor="report-reason" required>
            <Textarea
              id="report-reason"
              rows={3}
              maxLength={MAX_REASON_LENGTH}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t.recommendations.reportPlaceholder}
              autoFocus
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={report.isPending}>
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            loading={report.isPending}
            disabled={!ready}
            onClick={() => report.mutate()}
          >
            <Flag aria-hidden /> {t.recommendations.report}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
