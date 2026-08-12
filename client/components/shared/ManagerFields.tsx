'use client';

import * as React from 'react';
import { UserPlus, UserSearch } from 'lucide-react';
import type { AdminUser, NewManagerInput } from '@/lib/api/resources';
import { useI18n } from '@/components/layout/I18nProvider';
import { UserPicker } from '@/components/shared/UserPicker';
import { Field, Input } from '@/components/ui/Field';
import { cn } from '@/lib/utils';

export type ManagerChoice =
  { mode: 'existing'; user: AdminUser | null } | { mode: 'new'; draft: NewManagerInput };

export const EMPTY_MANAGER: ManagerChoice = { mode: 'existing', user: null };

/** The body an academy create/update request should carry, or `{}` if incomplete. */
export function managerBody(choice: ManagerChoice): {
  managerUserId?: string;
  newManager?: NewManagerInput;
} {
  if (choice.mode === 'existing') {
    return choice.user ? { managerUserId: choice.user.id } : {};
  }
  const { firstName, lastName, phone } = choice.draft;
  if (!firstName.trim() || !lastName.trim()) return {};
  return {
    newManager: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      ...(phone?.trim() ? { phone: phone.trim() } : {}),
    },
  };
}

export function isManagerComplete(choice: ManagerChoice) {
  return Object.keys(managerBody(choice)).length > 0;
}

/**
 * Names the academy's one manager, either way round.
 *
 * Both paths exist because both cases are common and neither substitutes for the
 * other. Most academy directors here are not already users, so "search for them"
 * alone would strand the majority — but a director who *is* already a scout on the
 * platform must not be issued a second account, or the same person ends up with
 * two identities and the endorsement graph splits between them.
 */
export function ManagerFields({
  value,
  onChange,
}: {
  value: ManagerChoice;
  onChange: (next: ManagerChoice) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="border-border space-y-3 rounded-lg border p-3">
      <div className="grid grid-cols-2 gap-2">
        <ModeButton
          active={value?.mode === 'existing'}
          icon={UserSearch}
          label={t.admin.managerExisting}
          hint={t.admin.managerExistingHint}
          onClick={() => onChange(EMPTY_MANAGER)}
        />
        <ModeButton
          active={value?.mode === 'new'}
          icon={UserPlus}
          label={t.admin.managerNew}
          hint={t.admin.managerNewHint}
          onClick={() =>
            onChange({ mode: 'new', draft: { firstName: '', lastName: '', phone: '' } })
          }
        />
      </div>

      {value?.mode === 'existing' ? (
        <UserPicker
          value={value?.user}
          onChange={(user) => onChange({ mode: 'existing', user })}
          placeholder={t.admin.findUser}
        />
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.admin.firstName} htmlFor="mgr-first" required>
              <Input
                id="mgr-first"
                placeholder={t.placeholders.firstName}
                value={value?.draft.firstName}
                onChange={(event) =>
                  onChange({
                    mode: 'new',
                    draft: { ...value.draft, firstName: event.target.value },
                  })
                }
              />
            </Field>
            <Field label={t.admin.lastName} htmlFor="mgr-last" required>
              <Input
                id="mgr-last"
                placeholder={t.placeholders.lastName}
                value={value?.draft.lastName}
                onChange={(event) =>
                  onChange({ mode: 'new', draft: { ...value.draft, lastName: event.target.value } })
                }
              />
            </Field>
          </div>

          <Field label={t.admin.managerPhone} htmlFor="mgr-phone" hint={t.admin.managerPhoneHint}>
            <Input
              id="mgr-phone"
              type="tel"
              placeholder="+998 90 123 45 67"
              value={value?.draft.phone ?? ''}
              onChange={(event) =>
                onChange({ mode: 'new', draft: { ...value.draft, phone: event.target.value } })
              }
            />
          </Field>

          <p className="text-muted text-xs">{t.admin.managerGeneratedHint}</p>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg border p-2.5 text-left transition-colors',
        active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <Icon className={cn('size-4', active && 'text-primary')} aria-hidden />
        {label}
      </span>
      <span className="text-muted mt-0.5 block text-xs">{hint}</span>
    </button>
  );
}
