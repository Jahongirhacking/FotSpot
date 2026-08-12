'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, UserMinus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyGroup, AcademyMemberRole } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Field';
import { ageFrom, initials } from '@/lib/utils';

/** Reserve has no id — it is the absence of a group. */
export const RESERVE = '';

/**
 * The shape every screen that lists academy people already has.
 *
 * Deliberately structural rather than one of the API types: the roster endpoint
 * and the group endpoint return slightly different objects, and both satisfy
 * this. A row should not care which query it came from.
 */
export interface MemberRowData {
  id: string;
  role: AcademyMemberRole;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  avatarUrl: string | null;
  playerId: string | null;
  primaryPosition: string | null;
  birthDate: string | null;
  coachType: string | null;
  group?: { id: string; name: string } | null;
  level?: number | null;
  successRate?: number | null;
}

/** What a manager may do to a row. Absent means the list is read-only. */
export interface MemberControls {
  academyId: string;
  groups: AcademyGroup[];
  onChanged: () => void;
}

function displayName(member: MemberRowData) {
  return [member?.firstName, member?.lastName].filter(Boolean).join(' ') || member?.username || '—';
}

/**
 * One person, the same way everywhere they are listed.
 *
 * The second line changes with what the role means here: a player's age and
 * position, a coach's age and job, a scout's standing. A scout gets no squad
 * control at all — they work for several academies at once (§1.5.3), so a group
 * would be a fiction rather than a blank.
 */
export function MemberRow({
  member,
  controls,
}: {
  member: MemberRowData;
  controls?: MemberControls;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  // Which panel is open, held here rather than inside each button: an expanded
  // warning has to be a full-width sibling of the row's controls, not a child of
  // the strip they sit in, or it inherits that strip's width.
  const [panel, setPanel] = React.useState<'transfer' | 'expel' | null>(null);

  const move = useMutation({
    mutationFn: (groupId: string) =>
      browserFetch(`/academies/${controls!.academyId}/groups/move`, {
        method: 'POST',
        body: { memberIds: [member?.id], ...(groupId === RESERVE ? {} : { groupId }) },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['group'] });
      controls!.onChanged();
    },
  });

  const detail =
    member?.role === 'SCOUT'
      ? // No stats row means they have recommended nobody yet, so there is no
        // standing to report — better than printing a level they have not earned.
        member?.level == null
        ? t.recommendations.nothingYet
        : `${t.profile.level} ${member?.level} · ${Math.round(member?.successRate ?? 0)}%`
      : [
          member?.birthDate ? `${ageFrom(member?.birthDate)}` : null,
          member?.role === 'PLAYER' ? member?.primaryPosition : member?.coachType,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <li className="flex flex-wrap items-center gap-3 p-2">
      <Avatar
        src={member?.avatarUrl}
        fallback={initials(member?.firstName ?? '', member?.lastName ?? '')}
        className="size-10 shrink-0"
      />

      <div className="min-w-0 flex-1">
        {member?.playerId ? (
          <Link
            href={`/players/${member?.playerId}`}
            className="truncate text-sm font-medium hover:underline"
          >
            {displayName(member)}
          </Link>
        ) : (
          <p className="truncate text-sm font-medium">{displayName(member)}</p>
        )}
        <p className="text-muted truncate text-xs">{detail}</p>
      </div>

      {/* The controls travel together. On a phone they take a line of their own
          so the name above keeps the full width instead of being truncated to
          make room for a group picker. */}
      {controls && (
        <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
          {member?.role !== 'SCOUT' && (
            <>
              <Select
                aria-label={t.academy.group}
                value={member?.group?.id ?? RESERVE}
                disabled={move.isPending}
                onChange={(event) => move.mutate(event.target.value)}
                className="w-36 shrink-0 sm:w-40"
              >
                <option value={RESERVE}>{t.nav.reserve}</option>
                {controls.groups.map((group) => (
                  <option key={group?.id} value={group?.id}>
                    {group?.name}
                  </option>
                ))}
              </Select>

              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                aria-label={t.academy.transferTo}
                onClick={() => setPanel(panel === 'transfer' ? null : 'transfer')}
              >
                <ArrowRightLeft aria-hidden />
              </Button>
            </>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="text-danger shrink-0"
            aria-label={t.academy.expel}
            onClick={() => setPanel(panel === 'expel' ? null : 'expel')}
          >
            <UserMinus aria-hidden />
          </Button>
        </div>
      )}

      {controls && panel === 'transfer' && (
        <TransferPanel
          academyId={controls.academyId}
          memberId={member?.id}
          onClose={() => setPanel(null)}
          onDone={controls.onChanged}
        />
      )}

      {controls && panel === 'expel' && (
        <ExpelPanel
          academyId={controls.academyId}
          memberId={member?.id}
          onClose={() => setPanel(null)}
          onDone={controls.onChanged}
        />
      )}
    </li>
  );
}

/**
 * Ending a membership.
 *
 * Not a delete: the row goes to RELEASED, so every assessment the person made
 * and every squad they were in still means something, and the academy can invite
 * them back later. The warning says exactly what is lost — the group and, for
 * staff, the academy's backing — because "expel" reads as permanent and here it
 * is not.
 */
function ExpelPanel({
  academyId,
  memberId,
  onClose,
  onDone,
}: {
  academyId: string;
  memberId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();

  const expel = useMutation({
    mutationFn: () =>
      browserFetch(`/academies/${academyId}/members/${memberId}/release`, { method: 'POST' }),
    onSuccess: () => {
      onClose();
      onDone();
    },
  });

  return (
    <div className="w-full space-y-2">
      <Alert tone="danger">{t.academy.expelWarning}</Alert>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button
          size="sm"
          variant="danger"
          loading={expel.isPending}
          onClick={() => {
            if (window.confirm(t.academy.confirmExpel)) expel.mutate();
          }}
        >
          <UserMinus aria-hidden /> {t.academy.expel}
        </Button>
      </div>
    </div>
  );
}

/**
 * A squad split the way a coaching staff talks about it: the players, then the
 * people who coach them. One undivided list makes a manager read every row to
 * answer "who takes this group?".
 */
export function MemberSections({
  members,
  controls,
  emptyLabel,
}: {
  members: MemberRowData[];
  controls?: MemberControls;
  emptyLabel: string;
}) {
  const { t } = useI18n();

  const players = members?.filter((member) => member?.role === 'PLAYER');
  const staff = members?.filter((member) => member?.role !== 'PLAYER');

  if (members?.length === 0) return <p className="text-muted p-2 text-sm">{emptyLabel}</p>;

  return (
    <div className="space-y-4">
      {[
        { label: t.profile.players, rows: players },
        { label: t.profile.coaches, rows: staff },
      ]
        .filter((section) => section.rows.length > 0)
        .map((section) => (
          <section key={section.label}>
            <h3 className="text-muted px-2 pb-1 text-xs font-semibold tracking-wide uppercase">
              {section.label} · {section.rows.length}
            </h3>
            <ul className="divide-border divide-y">
              {section.rows.map((member) => (
                <MemberRow key={member?.id} member={member} controls={controls} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

/**
 * Offering somebody to another academy — the one action here that leaves.
 *
 * Nothing moves on click: the other academy has to accept, and until it does the
 * member stays where they are. The warning says so, because "transfer" sounds
 * like something that has already happened.
 */
function TransferPanel({
  academyId,
  memberId,
  onClose,
  onDone,
}: {
  academyId: string;
  memberId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [toAcademyId, setToAcademyId] = React.useState('');

  const others = useQuery({
    queryKey: ['academies', 'public'],
    queryFn: () => browserFetch<{ id: string; name: string }[]>('/academies'),
  });

  const request = useMutation({
    mutationFn: () =>
      browserFetch(`/academies/${academyId}/transfers`, {
        method: 'POST',
        body: { memberId, toAcademyId },
      }),
    onSuccess: () => {
      onClose();
      onDone();
    },
  });

  return (
    <div className="w-full space-y-2">
      <Alert tone="warning">{t.academy.transferWarning}</Alert>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label={t.academy.transferTo}
          value={toAcademyId}
          onChange={(event) => setToAcademyId(event.target.value)}
          className="min-w-40 flex-1"
        >
          <option value="">{t.academy.transferTo}</option>
          {(others.data ?? [])
            .filter((academy) => academy?.id !== academyId)
            .map((academy) => (
              <option key={academy?.id} value={academy?.id}>
                {academy?.name}
              </option>
            ))}
        </Select>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button
          size="sm"
          disabled={!toAcademyId}
          loading={request.isPending}
          onClick={() => {
            if (window.confirm(t.academy.confirmTransfer)) request.mutate();
          }}
        >
          {t.academy.transferTo}
        </Button>
      </div>
    </div>
  );
}
