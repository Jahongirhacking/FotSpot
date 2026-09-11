'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight, MessageSquare, Send } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Page } from '@/lib/api/client';
import type { AdminUser } from '@/lib/api/resources';
import type { AdminChat, AdminMessage, AdminMessageUser } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { UserPicker } from '@/components/shared/UserPicker';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/Drawer';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { cn, formatDateTime, initials } from '@/lib/utils';

const PAGE_SIZE = 10;
const CHATS_KEY = ['admin-chats'] as const;

/**
 * The team's messages to users, from a button that is always in reach.
 *
 * An admin writing to a user used to mean leaving whatever screen they were
 * on. This is a floating button in the corner that opens a drawer with two
 * tabs: **History**, everyone the team has written to with the last thing
 * said and how many messages there are, paged; and **New chat**, a person and
 * a message. Opening a history row shows that person's thread and a box to
 * write again.
 *
 * One-way by design. The user receives each message as a notification — in
 * the app, on the socket, and on Telegram if linked — and replies through the
 * support channels the product already has. Rendered only for an account
 * acting as an admin; the API refuses everybody else regardless.
 */
export function AdminChatFloat() {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<'history' | 'new'>('history');
  const [thread, setThread] = React.useState<AdminMessageUser | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.admin.chatOpen}
        title={t.admin.chatOpen}
        className={cn(
          'bg-primary text-primary-foreground fixed right-4 z-40 grid size-14 place-items-center rounded-full shadow-lg transition-transform hover:scale-105',
          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
          // Above the bottom bar on a phone, in the corner on a laptop.
          'bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-6',
        )}
      >
        <MessageSquare className="size-6" aria-hidden />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="sm:max-w-lg">
          <div className="border-border border-b px-5 pt-5 pb-3">
            <DrawerTitle className="flex items-center gap-2 text-lg font-bold">
              <MessageSquare className="text-primary size-5" aria-hidden /> {t.admin.chatTitle}
            </DrawerTitle>
            <DrawerDescription className="sr-only">{t.admin.chatNewHint}</DrawerDescription>
            {thread ? (
              <button
                type="button"
                onClick={() => setThread(null)}
                className="text-muted hover:text-foreground mt-3 inline-flex min-h-9 items-center gap-1 text-sm"
              >
                <ArrowLeft className="size-4" aria-hidden /> {t.admin.chatBack}
              </button>
            ) : (
              <div
                role="tablist"
                className="bg-surface-2 mt-3 grid grid-cols-2 gap-1 rounded-lg p-1"
              >
                {(['history', 'new'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={tab === value}
                    onClick={() => setTab(value)}
                    className={cn(
                      'min-h-10 rounded-md px-3 text-sm font-medium transition-colors',
                      tab === value ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
                    )}
                  >
                    {value === 'history' ? t.admin.chatHistory : t.admin.chatNew}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {thread ? (
              <Thread user={thread} />
            ) : tab === 'history' ? (
              <History onOpen={setThread} />
            ) : (
              <NewChat
                onSent={(user) => {
                  setThread(user);
                  setTab('history');
                }}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/** Everyone the team has written to, newest first, a page at a time. */
function History({ onOpen }: { onOpen: (user: AdminMessageUser) => void }) {
  const { t, f } = useI18n();
  const [page, setPage] = React.useState(1);
  const chats = useQuery({
    queryKey: [...CHATS_KEY, page],
    queryFn: () =>
      browserFetch<Page<AdminChat>>(`/admin/messages/chats?page=${page}&pageSize=${PAGE_SIZE}`),
  });

  if (chats.isPending) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (chats.isError) return <Alert tone="danger">{t.common.couldNotLoad}</Alert>;
  const { items, total } = chats.data;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title={t.admin.chatNoHistory}
        description={t.admin.chatHistoryHint}
      />
    );
  }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <p className="text-muted text-xs">{t.admin.chatHistoryHint}</p>
      <ul className="divide-border divide-y">
        {items.map((chat) => (
          <li key={chat.user?.id ?? chat.lastMessage?.id}>
            <button
              type="button"
              disabled={!chat.user}
              onClick={() => chat.user && onOpen(chat.user)}
              className="hover:bg-surface-2 flex w-full items-start gap-3 rounded-lg px-1 py-3 text-left"
            >
              <Avatar
                src={chat.user?.avatarUrl}
                fallback={initials(chat.user?.firstName, chat.user?.lastName)}
                className="size-10"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{personName(chat.user)}</span>
                  <span className="text-muted shrink-0 text-xs">{formatDateTime(chat.lastAt)}</span>
                </span>
                {chat.lastMessage && (
                  <span className="text-muted mt-0.5 line-clamp-2 block text-sm">
                    {chat.lastMessage.body}
                  </span>
                )}
                <span className="text-muted mt-1 block text-xs">
                  {f(t.admin.chatMessages, { count: chat.messageCount })}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <Pager
          page={page}
          pages={pages}
          onChange={setPage}
          older={t.admin.chatOlder}
          newer={t.admin.chatNewer}
        />
      )}
    </div>
  );
}

/** One person's thread, newest first, and a box to write again. */
function Thread({ user }: { user: AdminMessageUser }) {
  const { t } = useI18n();
  const [page, setPage] = React.useState(1);
  const thread = useQuery({
    queryKey: ['admin-thread', user.id, page],
    queryFn: () =>
      browserFetch<Page<AdminMessage> & { user: AdminMessageUser }>(
        `/admin/messages/chats/${user.id}?page=${page}&pageSize=${PAGE_SIZE}`,
      ),
  });
  const pages = Math.max(1, Math.ceil((thread.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar
          src={user.avatarUrl}
          fallback={initials(user.firstName, user.lastName)}
          className="size-10"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{personName(user)}</p>
          {user.username && <p className="text-muted truncate text-xs">@{user.username}</p>}
        </div>
      </div>

      <Composer recipientUserId={user.id} onSent={() => setPage(1)} />

      {thread.isPending ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : thread.isError ? (
        <Alert tone="danger">{t.common.couldNotLoad}</Alert>
      ) : (
        <>
          <ul className="space-y-2">
            {thread.data.items.map((message) => (
              <li key={message.id} className="bg-surface-2 rounded-xl px-3 py-2">
                <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                <p className="text-muted mt-1 text-xs">
                  {personName(message.sender)} · {formatDateTime(message.createdAt)}
                </p>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <Pager
              page={page}
              pages={pages}
              onChange={setPage}
              older={t.admin.chatOlder}
              newer={t.admin.chatNewer}
            />
          )}
        </>
      )}
    </div>
  );
}

/** A person and a first message. */
function NewChat({ onSent }: { onSent: (user: AdminMessageUser) => void }) {
  const { t } = useI18n();
  const [user, setUser] = React.useState<AdminUser | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-muted text-xs">{t.admin.chatNewHint}</p>
      <Field label={t.admin.chatPickUser} htmlFor="admin-chat-user">
        <UserPicker value={user} onChange={setUser} placeholder={t.admin.chatPickUserPlaceholder} />
      </Field>
      {user && (
        <Composer
          recipientUserId={user.id}
          onSent={() =>
            onSent({
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              username: user.username ?? null,
              avatarUrl: user.avatarUrl,
            })
          }
        />
      )}
    </div>
  );
}

/** The message box and its Send. Clears itself and refreshes the lists on success. */
function Composer({ recipientUserId, onSent }: { recipientUserId: string; onSent: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [body, setBody] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  // "Sent" shows for a moment after a send, then the counter comes back.
  const [justSent, setJustSent] = React.useState(false);
  React.useEffect(() => {
    if (!justSent) return;
    const id = window.setTimeout(() => setJustSent(false), 4000);
    return () => window.clearTimeout(id);
  }, [justSent]);

  const send = useMutation({
    mutationFn: () =>
      browserFetch<AdminMessage>('/admin/messages', {
        method: 'POST',
        body: { recipientUserId, body: body.trim() },
      }),
    onSuccess: () => {
      setBody('');
      setError(null);
      setJustSent(true);
      void queryClient.invalidateQueries({ queryKey: CHATS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['admin-thread', recipientUserId] });
      onSent();
    },
    onError: (problem: Error) => setError(problem.message),
  });

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim()) send.mutate();
      }}
    >
      <Field label={t.admin.chatMessage} htmlFor={`admin-chat-body-${recipientUserId}`}>
        <Textarea
          id={`admin-chat-body-${recipientUserId}`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t.admin.chatMessagePlaceholder}
          rows={4}
          maxLength={2000}
          required
        />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted text-xs">
          {justSent ? t.admin.chatSent : `${body.length}/2000`}
        </span>
        <Button type="submit" loading={send.isPending} disabled={!body.trim()}>
          <Send aria-hidden /> {t.admin.chatSend}
        </Button>
      </div>
    </form>
  );
}

/** Newer / older, inside the drawer: the page cannot go in the URL here. */
function Pager({
  page,
  pages,
  onChange,
  older,
  newer,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  older: string;
  newer: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft aria-hidden /> {newer}
      </Button>
      <span className="text-muted text-xs">
        {page} / {pages}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        {older} <ChevronRight aria-hidden />
      </Button>
    </div>
  );
}

function personName(user: AdminMessageUser | null | undefined): string {
  if (!user) return '—';
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.id;
}
