'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root className={cn('text-sm leading-none font-medium', className)} {...props} />
  );
}

const controlClasses =
  'bg-surface border-border placeholder:text-muted/70 min-h-11 w-full rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50 aria-[invalid=true]:border-danger';

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(controlClasses, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(controlClasses, 'min-h-24 resize-y', className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return <select className={cn(controlClasses, 'pr-8', className)} {...props} />;
}

/**
 * Label + control + error, wired together for screen readers.
 *
 * `error` drives both `aria-invalid` on the control and a visible message — the
 * client rule (CLAUDE.md §7) is that Zod's message is the single source, so nothing
 * here invents its own copy.
 */
export function Field({
  label,
  error,
  hint,
  required,
  htmlFor,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="text-danger ml-0.5" aria-label="required">
            *
          </span>
        )}
      </Label>
      {hint && (
        <p id={hintId} className="text-muted text-xs">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={errorId} role="alert" className="text-danger flex items-center gap-1 text-xs">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
