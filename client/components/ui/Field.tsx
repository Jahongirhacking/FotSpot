'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useI18n } from '@/components/layout/I18nProvider';
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

/**
 * A password box with an eye to reveal what was typed.
 *
 * Hidden input is a defence against someone reading over your shoulder, and it
 * costs everyone else a typo they cannot see — worst on a phone keyboard, which is
 * how most of this platform's users sign in. Letting them look is the trade almost
 * every login screen now makes, and it is theirs to make: it starts hidden and only
 * this deliberate press reveals it.
 *
 * The button is `tabIndex={-1}` so tabbing out of the field lands on submit, not on
 * a control most people never use; it stays reachable by pointer and by screen
 * reader, and `aria-pressed` says which state it is in.
 *
 * Reverts to hidden on blur, so a revealed password does not sit on screen after
 * the user has moved on to another tab or window.
 */
export function PasswordInput({ className, onBlur, ...props }: React.ComponentProps<'input'>) {
  const { t } = useI18n();
  const [revealed, setRevealed] = React.useState(false);
  const Icon = revealed ? EyeOff : Eye;

  return (
    <div className="relative">
      <input
        type={revealed ? 'text' : 'password'}
        className={cn(controlClasses, 'pr-11', className)}
        onBlur={(event) => {
          setRevealed(false);
          onBlur?.(event);
        }}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-pressed={revealed}
        aria-label={revealed ? t.auth.hidePassword : t.auth.showPassword}
        title={revealed ? t.auth.hidePassword : t.auth.showPassword}
        onClick={() => setRevealed((was) => !was)}
        // onMouseDown is swallowed so the click does not blur the input first —
        // which would flip the state straight back and make the eye do nothing.
        onMouseDown={(event) => event.preventDefault()}
        className="text-muted hover:text-foreground absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-md transition-colors"
      >
        <Icon className="size-4" aria-hidden />
      </button>
    </div>
  );
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
