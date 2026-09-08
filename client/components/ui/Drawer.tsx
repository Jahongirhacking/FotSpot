'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A panel from the right edge — the Dialog primitive with a different home.
 *
 * For a list somebody works through beside the page they came from: the
 * coach's participants for one trial, opened from the dashboard row, judged,
 * and closed without ever leaving the dashboard. A centred dialog is for a
 * question; this is for a task. Full-width on a phone, where a side panel
 * would be a sliver, and a fixed column from `sm` up.
 */
export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;
export const DrawerTitle = DialogPrimitive.Title;
export const DrawerDescription = DialogPrimitive.Description;

export function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          'bg-surface border-border fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto border-l shadow-xl',
          'pb-[env(safe-area-inset-bottom)] sm:max-w-xl',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="text-muted hover:bg-surface-2 absolute top-3.5 right-3.5 grid size-9 place-items-center rounded-lg bg-black/30 text-white backdrop-blur"
          aria-label="Close"
        >
          <X className="size-4" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DrawerBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex-1 p-5', className)} {...props} />;
}
