'use client';

import * as React from 'react';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Non-modal: a dropdown is a small layer beside its button, not a dialog, and
 * locking the page scroll behind it only produced a jump in the header. The
 * layer still closes on outside press and Escape.
 */
export const Menu = (props: React.ComponentProps<typeof DropdownPrimitive.Root>) => (
  <DropdownPrimitive.Root modal={false} {...props} />
);
export const MenuTrigger = DropdownPrimitive.Trigger;

export function MenuContent({
  className,
  align = 'end',
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'bg-surface border-border z-50 min-w-56 overflow-hidden rounded-xl border p-1 shadow-xl',
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function MenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Item>) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none',
        'data-highlighted:bg-surface-2 data-disabled:pointer-events-none data-disabled:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Label>) {
  return (
    <DropdownPrimitive.Label
      className={cn('text-muted px-2.5 py-1.5 text-xs font-medium uppercase', className)}
      {...props}
    />
  );
}

export function MenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Separator>) {
  return (
    <DropdownPrimitive.Separator
      className={cn('bg-border -mx-1 my-1 h-px', className)}
      {...props}
    />
  );
}

/** Menu item that shows a check when active — used by the role switcher. */
export function MenuRadioItem({
  className,
  checked,
  children,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Item> & { checked?: boolean }) {
  return (
    <MenuItem className={cn('justify-between', className)} {...props}>
      <span className="flex items-center gap-2.5">{children}</span>
      {checked && <Check className="text-primary" aria-hidden />}
    </MenuItem>
  );
}
