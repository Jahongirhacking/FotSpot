import * as React from 'react';
import { AlertTriangle, Info, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('bg-surface-3 animate-pulse rounded-lg', className)}
      aria-hidden
      {...props}
    />
  );
}

const alertIcons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
} as const;

const alertStyles = {
  info: 'bg-info/10 text-info border-info/25',
  success: 'bg-success/10 text-success border-success/25',
  warning: 'bg-warning/10 text-warning border-warning/25',
  danger: 'bg-danger/10 text-danger border-danger/25',
} as const;

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof alertIcons;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = alertIcons[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-2.5 rounded-lg border p-3 text-sm', alertStyles[tone], className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
    </div>
  );
}

/**
 * Empty states get a suggested action, never just "nothing here". An empty
 * two-sided marketplace is the default state early on (README §16) — these screens
 * are the product for the first months.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-border rounded-card flex flex-col items-center gap-3 border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="bg-surface-2 text-muted grid size-11 place-items-center rounded-full">
          <Icon className="size-5" />
        </div>
      )}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="text-muted mx-auto max-w-sm text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}
