import { NotificationEvent } from '@prisma/client';

/**
 * What a Telegram notification says, and where it points.
 *
 * Pure and DI-free like `scout-level.util.ts`, so the wording and the escaping
 * can be asserted without a bot, a database or a Nest container. That matters
 * more than usual for the escaping: a name containing `<` would otherwise make
 * Telegram reject the whole message with a parse error, and the failure would
 * show up as a missing notification rather than as anything obviously wrong.
 */

/**
 * The three characters Telegram's HTML mode reserves.
 *
 * Per core.telegram.org/bots/api#html-style, only `<`, `>` and `&` need
 * replacing — quotes do not, because none of the text below is ever placed
 * inside an attribute. A player called `Ben & Co <the 10>` is the case this
 * exists for, and without it Telegram answers 400 and the message is lost.
 */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Where a notification should take somebody, as a path.
 *
 * A path rather than a URL, so the origin comes from `APP_PUBLIC_URL` at the one
 * place that reads config, and a deployment pointing at a staging domain does
 * not need this file changed.
 *
 * Everything falls back to `/notifications`, which is the honest answer: the list
 * is where the notification exists, and a deep link that guesses at an id the
 * payload does not carry would land on a 404. Only events whose payload reliably
 * carries what the destination needs get a specific path.
 */
export function notificationPath(event: NotificationEvent, payload: Record<string, unknown>): string {
  const id = (key: string) => {
    const value = payload?.[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  };

  switch (event) {
    case NotificationEvent.TRIAL_INVITATION:
    case NotificationEvent.TRIAL_PUBLISHED: {
      const trialId = id('trialId');
      return trialId ? `/trials/${trialId}` : '/trials';
    }
    case NotificationEvent.RECOMMENDATION_ACCEPTED:
    case NotificationEvent.RECOMMENDATION_REJECTED:
      return '/recommendations';
    case NotificationEvent.REVIEW_ASSIGNED:
    case NotificationEvent.REVIEW_DECIDED:
      return '/recommendations/review';
    default:
      return '/notifications';
  }
}

/**
 * The message body, in Telegram HTML.
 *
 * ## Why the notification's own text is not built here
 *
 * The in-app list renders each event from its payload **in the reader's
 * language**, on the client (`lib/notifications.ts`). Re-deriving those sentences
 * here would be a second copy of that logic in a different language, on the
 * server, with no access to the reader's locale — and the two would drift the
 * first time either was touched.
 *
 * So this sends a short, event-neutral prompt plus the link. It is a nudge to
 * open the app, not a replacement for the notification. `headline` is passed in
 * for the events where a caller genuinely has a better sentence to hand.
 */
export function notificationMessage(options: {
  /** Absolute, already origin-prefixed. */
  url: string;
  /** One line describing what happened, plain text. Escaped here, not by the caller. */
  headline: string;
}): string {
  return [
    '🔔 <b>FotSpot</b>',
    '',
    escapeHtml(options.headline),
    '',
    `<a href="${escapeHtml(options.url)}">FotSpot'ni ochish</a>`,
  ].join('\n');
}

/**
 * What the bot says when somebody presses /start.
 *
 * Two versions, because the two situations need opposite instructions and
 * getting them the wrong way round leaves a person waiting for notifications
 * that will never come.
 */
export function startMessage(linked: boolean, connectUrl: string): string {
  if (linked) {
    return [
      '🔔 <b>FotSpot</b>',
      '',
      'Telegram bildirishnomalari yoqildi.',
      "Endi FotSpot'dagi yangiliklar shu yerga keladi.",
    ].join('\n');
  }

  return [
    '🔔 <b>FotSpot</b>',
    '',
    "Bu Telegram hisobi hali hech qanday FotSpot hisobiga ulanmagan.",
    '',
    `<a href="${escapeHtml(connectUrl)}">FotSpot'da Telegramni ulash</a>`,
  ].join('\n');
}
