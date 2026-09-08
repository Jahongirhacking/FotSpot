import type { Job } from 'bullmq';
import { TelegramProcessor } from './telegram.processor';
import { SEND_ADMIN_ALERT_JOB, SEND_NOTIFICATION_JOB } from './telegram.constants';
import type { TelegramJob } from './telegram.constants';

/**
 * Where the worker sends things, by environment.
 *
 * Outside production, nothing reaches a real person: every message goes to
 * the operator's chat tagged `#DEV_ENV`, and with no operator chat configured
 * it is dropped. In production the chat on the job is the chat that gets it.
 */
function build(env: Record<string, string | undefined>) {
  const telegram = { send: jest.fn(async () => ({ status: 'sent' as const })) };
  const notifications = { publicUrl: 'https://fotspot.uz' };
  const config = { get: (key: string) => env[key] };
  const processor = new TelegramProcessor(
    telegram as never,
    notifications as never,
    config as never,
  );
  return { processor, telegram };
}

const userJob = {
  name: SEND_NOTIFICATION_JOB,
  data: { userId: 'user-1', telegramId: '111', event: 'TRIAL_RESULT', payload: { trialId: 't1' } },
} as unknown as Job<TelegramJob>;

const alertJob = {
  name: SEND_ADMIN_ALERT_JOB,
  data: { chatId: '999', text: '🤝 Bobur joined' },
} as unknown as Job<TelegramJob>;

describe('TelegramProcessor — production sends to the chat on the job', () => {
  it('delivers a user copy to the user, untagged', async () => {
    const { processor, telegram } = build({
      NODE_ENV: 'production',
      TELEGRAM_ADMIN_CHAT_ID: '999',
    });

    await processor.process(userJob);

    expect(telegram.send).toHaveBeenCalledTimes(1);
    const [chatId, text] = telegram.send.mock.calls[0] as unknown as [string, string];
    expect(chatId).toBe('111');
    expect(text).not.toContain('#DEV_ENV');
  });

  it('delivers an operator alert to the operator, untagged', async () => {
    const { processor, telegram } = build({
      NODE_ENV: 'production',
      TELEGRAM_ADMIN_CHAT_ID: '999',
    });

    await processor.process(alertJob);

    const [chatId, text] = telegram.send.mock.calls[0] as unknown as [string, string];
    expect(chatId).toBe('999');
    expect(text).toBe('🤝 Bobur joined');
  });
});

describe('TelegramProcessor — outside production everything goes to the operator, tagged', () => {
  it('redirects a user copy to the operator chat and says who it was for', async () => {
    const { processor, telegram } = build({
      NODE_ENV: 'development',
      TELEGRAM_ADMIN_CHAT_ID: '999',
    });

    await processor.process(userJob);

    const [chatId, text] = telegram.send.mock.calls[0] as unknown as [string, string];
    expect(chatId).toBe('999');
    expect(text.split('\n')[0]).toBe('#DEV_ENV (for user user-1, TRIAL_RESULT)');
    expect(text).toContain('FotSpot');
  });

  it('tags an operator alert', async () => {
    const { processor, telegram } = build({ NODE_ENV: 'test', TELEGRAM_ADMIN_CHAT_ID: '999' });

    await processor.process(alertJob);

    const [chatId, text] = telegram.send.mock.calls[0] as unknown as [string, string];
    expect(chatId).toBe('999');
    expect(text).toBe('#DEV_ENV\n🤝 Bobur joined');
  });

  it('treats an unset NODE_ENV as not production', async () => {
    const { processor, telegram } = build({ TELEGRAM_ADMIN_CHAT_ID: '999' });

    await processor.process(userJob);

    expect((telegram.send.mock.calls[0] as unknown as [string])[0]).toBe('999');
  });

  it('sends nothing at all when no operator chat is configured', async () => {
    const { processor, telegram } = build({ NODE_ENV: 'development' });

    await processor.process(userJob);
    await processor.process(alertJob);

    expect(telegram.send).not.toHaveBeenCalled();
  });
});
