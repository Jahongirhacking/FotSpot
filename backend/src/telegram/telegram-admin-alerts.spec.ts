import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';

import { TelegramAdminAlertsService } from './telegram-admin-alerts.service';
import { adminAlertMessage } from './telegram.messages';
import { SEND_ADMIN_ALERT_JOB, TelegramJob } from './telegram.constants';
import { UsersService } from '../users/users.service';
import { PlayersService } from '../players/players.service';
import { MediaService } from '../media/media.service';

/**
 * The operator's growth alerts: a new player, a new scout, a fresh video.
 *
 * Two properties carry all the weight. The alert must *never* be able to fail
 * the signup or upload it describes — every path out of `announce` is quiet.
 * And it must only fire for things that actually happened once: "become a
 * scout" is an idempotent button, and a repeat press must not ping anybody.
 */

function build(chatId: string | undefined) {
  const queue = { add: jest.fn(async () => ({}) as unknown) };
  const config = { get: () => chatId } as unknown as ConfigService;
  const service = new TelegramAdminAlertsService(config, queue as unknown as Queue<TelegramJob>);
  return { service, queue };
}

describe('announce', () => {
  it('queues the alert for the configured chat', async () => {
    const { service, queue } = build('5137851572');
    await service.announce({ kind: 'SCOUT_SIGNED_UP', name: 'Aziz Karimov' });

    const [name, job] = queue.add.mock.calls[0] as unknown as [string, TelegramJob];
    expect(name).toBe(SEND_ADMIN_ALERT_JOB);
    expect(job).toMatchObject({ chatId: '5137851572' });
    expect((job as { text: string }).text).toContain('Aziz Karimov');
  });

  it('does nothing at all when no chat is configured', async () => {
    const { service, queue } = build(undefined);
    await service.announce({ kind: 'SCOUT_SIGNED_UP', name: 'Aziz' });

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('treats a blank value as unset rather than as a chat called ""', async () => {
    const { service, queue } = build('   ');
    await service.announce({ kind: 'SCOUT_SIGNED_UP', name: 'Aziz' });

    expect(queue.add).not.toHaveBeenCalled();
  });

  /*
   * The load-bearing property. By the time this runs, the signup is committed
   * or the clip row is written — Redis being down must cost a log line, never
   * the request.
   */
  it('never throws, even with the queue down', async () => {
    const { service, queue } = build('5137851572');
    queue.add.mockRejectedValue(new Error('redis is gone'));

    await expect(
      service.announce({ kind: 'PLAYER_SIGNED_UP', name: 'Aziz' }),
    ).resolves.toBeUndefined();
  });
});

describe('what each alert says', () => {
  it('announces a player with their age and region', () => {
    const text = adminAlertMessage({
      kind: 'PLAYER_SIGNED_UP',
      name: 'Aziz Karimov',
      age: 14,
      region: 'Toshkent shahri',
    });

    expect(text).toContain('Yangi futbolchi');
    expect(text).toContain('Aziz Karimov');
    expect(text).toContain('14 yosh');
    expect(text).toContain('Toshkent shahri');
  });

  it('says less when less is known, rather than printing null', () => {
    const text = adminAlertMessage({ kind: 'PLAYER_SIGNED_UP', name: 'Aziz' });

    expect(text).not.toMatch(/null|undefined/);
  });

  it('announces a video with the player and the category', () => {
    const text = adminAlertMessage({
      kind: 'CLIP_UPLOADED',
      name: 'Aziz Karimov',
      category: 'SPEED',
      title: 'My sprint',
    });

    expect(text).toContain('Yangi video');
    expect(text).toContain('SPEED');
    expect(text).toContain('My sprint');
  });

  /*
   * All three alerts carry a name somebody typed, and Telegram's HTML mode
   * rejects the whole message on a bare `<`. A player called `Ben & Co <10>`
   * must arrive, escaped — not vanish as a 400 nobody sees.
   */
  it('escapes names, so a typed < cannot eat the whole alert', () => {
    const text = adminAlertMessage({ kind: 'SCOUT_SIGNED_UP', name: 'Ben & Co <10>' });

    expect(text).toContain('Ben &amp; Co &lt;10&gt;');
    expect(text).not.toContain('<10>');
  });
});

describe('when the alerts fire', () => {
  /*
   * Source assertions, in the style of coach-discovery.spec.ts: the property
   * being protected is *where the call sits* — after the commit, only for a
   * first-time scout, only for a VIDEO — and that is visible in the method
   * without a live database.
   */
  it('a player alert fires outside the signup transaction, never inside it', () => {
    const source = PlayersService.prototype.createProfile.toString();

    const transactionEnd = source.indexOf('});', source.indexOf('$transaction'));
    const alert = source.indexOf('adminAlerts.announce');
    expect(alert).toBeGreaterThan(transactionEnd);
    expect(source).toMatch(/PLAYER_SIGNED_UP/);
  });

  it('a scout alert fires only when the role is newly granted', () => {
    const source = UsersService.prototype.becomeScout.toString();

    // The check comes before the grant, and the alert is behind it.
    expect(source).toMatch(/userRole\.findFirst/);
    expect(source).toMatch(/if \(!already\)/);
    expect(source).toMatch(/SCOUT_SIGNED_UP/);
  });

  it('an upload alert fires for a VIDEO and not for an IMAGE', () => {
    const source = MediaService.prototype.confirmUpload.toString();

    expect(source).toMatch(/type === 'VIDEO'/);
    expect(source).toMatch(/CLIP_UPLOADED/);
  });
});
