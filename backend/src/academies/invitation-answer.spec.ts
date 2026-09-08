import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import type { AuditService } from '../audit/audit.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { SquadNotificationsService } from './squad-notifications.service';
import type { RedisService } from '../redis/redis.service';

/**
 * The invited person's answer.
 *
 * A yes is recorded at once and *acted on* after an undo window — the
 * membership, the manager's notification and any release from a previous
 * club run from a delayed job, so a mis-tapped yes can be taken back before
 * anything has happened. A no is final, and carries the person's note to the
 * manager. See invitations.constants.ts.
 */

const INVITATION = {
  id: 'invite-1',
  academyId: 'academy-1',
  userId: 'player-user-1',
  role: 'PLAYER',
  status: 'PENDING',
  note: null,
  answerNote: null,
  invitedByUserId: 'manager-1',
  decidedAt: null,
  settledAt: null,
  academy: { id: 'academy-1', name: 'Yoshlik', kind: 'ACADEMY' },
};

function build(invitation: Record<string, unknown> = INVITATION) {
  const tx = {
    academyMember: { update: jest.fn(async () => ({})), upsert: jest.fn(async () => ({})) },
    academyEndorsement: { upsert: jest.fn(async () => ({})) },
  };
  const prisma = {
    academyInvitation: {
      findUnique: jest.fn(async (): Promise<unknown> => invitation),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...invitation,
        ...data,
      })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async (): Promise<unknown[]> => []),
    },
    // The operator's alert names the player who joined.
    user: {
      findUnique: jest.fn(async (): Promise<unknown> => ({
        firstName: 'Bobur',
        lastName: 'Aliyev',
        username: 'bobur',
      })),
    },
    academyMember: {
      findUnique: jest.fn(async (): Promise<unknown> => null),
      findFirst: jest.fn(async (): Promise<unknown> => null),
    },
    coachProfile: { findUnique: jest.fn(async (): Promise<unknown> => null) },
    $transaction: jest.fn(async (run: (tx: unknown) => Promise<unknown>) => run(tx)),
  };
  const notifications = { notify: jest.fn(async () => undefined) };
  const squads = {
    announceJoined: jest.fn(async () => undefined),
    announceLeft: jest.fn(async () => undefined),
  };
  const audit = { record: jest.fn(async () => undefined) };
  /** The operator's Telegram chat. Returns its failures, never throws. */
  const adminAlerts = { announce: jest.fn(async () => undefined) };
  const job = { remove: jest.fn(async () => undefined) };
  const queue = {
    add: jest.fn(async () => undefined),
    getJob: jest.fn(async (): Promise<unknown> => job),
  };

  const service = new InvitationsService(
    prisma as unknown as PrismaService,
    {} as unknown as StorageService,
    audit as unknown as AuditService,
    notifications as unknown as NotificationsService,
    squads as unknown as SquadNotificationsService,
    { del: jest.fn(async () => undefined) } as unknown as RedisService,
    queue as never,
    adminAlerts as never,
  );
  return { service, prisma, tx, notifications, squads, audit, queue, job, adminAlerts };
}

describe('decide — a yes is recorded now and settled later', () => {
  it('marks the invitation accepted and queues the settlement after the window', async () => {
    const { service, prisma, queue } = build();

    const answer = await service.decide('player-user-1', 'invite-1', true);

    expect(prisma.academyInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACCEPTED' }) }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'settle-acceptance',
      { invitationId: 'invite-1' },
      expect.objectContaining({ jobId: 'settle-acceptance-invite-1', delay: 30_000 }),
    );
    expect('undoUntil' in answer && answer.undoUntil.getTime()).toBeGreaterThan(
      Date.now() + 20_000,
    );
  });

  /* Nothing has happened yet while the person may still change their mind. */
  it('writes no membership and tells nobody yet', async () => {
    const { service, prisma, notifications, squads } = build();

    await service.decide('player-user-1', 'invite-1', true);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(squads.announceJoined).not.toHaveBeenCalled();
  });

  it('still refuses somebody already at the academy, before recording anything', async () => {
    const { service, prisma, queue } = build();
    prisma.academyMember.findUnique.mockResolvedValue({ id: 'm', status: 'ACTIVE' });

    await expect(service.decide('player-user-1', 'invite-1', true)).rejects.toThrow(
      ConflictException,
    );
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe('decide — a no is final and carries a note', () => {
  it('records the note and hands it to the manager', async () => {
    const { service, prisma, notifications } = build();

    await service.decide('player-user-1', 'invite-1', false, '  Too far to travel ');

    expect(prisma.academyInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', answerNote: 'Too far to travel' }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      'manager-1',
      'ACADEMY_JOIN_ANSWER',
      expect.objectContaining({ accepted: false, note: 'Too far to travel' }),
      { userId: 'player-user-1', role: 'player' },
    );
  });

  it('needs no note', async () => {
    const { service, notifications } = build();

    await service.decide('player-user-1', 'invite-1', false);

    const [, , payload] = notifications.notify.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(payload).not.toHaveProperty('note');
  });
});

describe('settleAcceptance — what a yes sets in motion', () => {
  const accepted = { ...INVITATION, status: 'ACCEPTED', decidedAt: new Date() };

  it('writes the membership in the reserve and tells the manager once, as a joining', async () => {
    const { service, tx, notifications, squads } = build(accepted);

    await expect(service.settleAcceptance('invite-1')).resolves.toEqual({ settled: true });

    expect(tx.academyMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ academyId: 'academy-1', userId: 'player-user-1' }),
        update: expect.objectContaining({ groupId: null, status: 'ACTIVE' }),
      }),
    );
    // "A player joined your squad" is the one notice; no second "accepted" one.
    expect(squads.announceJoined).toHaveBeenCalledWith(
      'academy-1',
      'player-user-1',
      'player-user-1',
    );
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  /* The operator hears about every player an academy takes on, by name. */
  it('tells the operator which player joined which academy', async () => {
    const { service, adminAlerts } = build(accepted);

    await service.settleAcceptance('invite-1');

    expect(adminAlerts.announce).toHaveBeenCalledWith({
      kind: 'PLAYER_JOINED_ACADEMY',
      name: 'Bobur Aliyev',
      academy: 'Yoshlik',
    });
  });

  it('does not alert the operator about a coach joining', async () => {
    const { service, adminAlerts, tx } = build({ ...accepted, role: 'COACH' });

    await service.settleAcceptance('invite-1');

    expect(tx.academyMember.upsert).toHaveBeenCalled();
    expect(adminAlerts.announce).not.toHaveBeenCalled();
  });

  it('claims the row under a guard and settles nothing twice', async () => {
    const { service, prisma, tx, notifications } = build(accepted);
    prisma.academyInvitation.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.settleAcceptance('invite-1')).resolves.toEqual({
      settled: false,
      reason: 'already',
    });
    expect(tx.academyMember.upsert).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  /* An undone yes is back at PENDING: the job that was queued for it finds nothing. */
  it('settles nothing for a yes that was taken back', async () => {
    const { service, tx, notifications } = build();

    await expect(service.settleAcceptance('invite-1')).resolves.toEqual({
      settled: false,
      reason: 'undone',
    });
    expect(tx.academyMember.upsert).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

describe('undoAcceptance', () => {
  const accepted = { ...INVITATION, status: 'ACCEPTED', decidedAt: new Date() };

  it('removes the job and returns the invitation to unanswered', async () => {
    const { service, prisma, job } = build(accepted);

    await service.undoAcceptance('player-user-1', 'invite-1');

    expect(job.remove).toHaveBeenCalled();
    expect(prisma.academyInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PENDING', decidedAt: null } }),
    );
  });

  it('is refused once the membership has been written', async () => {
    const { service } = build({ ...accepted, settledAt: new Date() });

    await expect(service.undoAcceptance('player-user-1', 'invite-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it("is the invited person's alone", async () => {
    const { service } = build(accepted);

    await expect(service.undoAcceptance('somebody-else', 'invite-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('has nothing to undo on an unanswered invitation', async () => {
    const { service } = build();

    await expect(service.undoAcceptance('player-user-1', 'invite-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
