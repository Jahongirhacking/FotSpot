import { InvitationsService } from './invitations.service';
import type { AuditService } from '../audit/audit.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { SquadNotificationsService } from './squad-notifications.service';
import type { StorageService } from '../storage/storage.service';

/**
 * What the invited player is told, and by whom.
 *
 * "An academy is inviting you to join" is untrue when a neighbourhood team sent
 * it, and the person reading it is the one deciding — so the notification has to
 * carry which kind of organisation asked (LOCAL_TEAM.md §4/§20). The wording is
 * the client's to choose in the reader's language; the fact is the API's to send.
 */

function build(kind: 'ACADEMY' | 'LOCAL_TEAM') {
  const prisma = {
    academyMember: {
      findFirst: jest.fn(async (): Promise<unknown> => ({ id: 'manager-membership' })),
      findUnique: jest.fn(async (): Promise<unknown> => null),
    },
    academyProfile: {
      findUnique: jest.fn(async (): Promise<unknown> => ({
        id: 'academy-1',
        name: 'Yoshlik',
        kind,
      })),
    },
    user: {
      findUnique: jest.fn(async (): Promise<unknown> => ({
        id: 'player-user-1',
        isActive: true,
        roles: [{ role: { name: 'player' } }],
        coachProfile: null,
      })),
    },
    academyInvitation: {
      findFirst: jest.fn(async (): Promise<unknown> => null),
      create: jest.fn(async (): Promise<unknown> => ({ id: 'invite-1', note: null })),
      findMany: jest.fn(async (): Promise<unknown> => []),
    },
  };

  const notifications = { notify: jest.fn(async () => undefined) };

  const service = new InvitationsService(
    prisma as unknown as PrismaService,
    {} as unknown as StorageService,
    { record: jest.fn(async () => undefined) } as unknown as AuditService,
    notifications as unknown as NotificationsService,
    {} as unknown as SquadNotificationsService,
    { del: jest.fn(async () => undefined) } as unknown as RedisService,
  );

  return { service, prisma, notifications };
}

const DTO = { userId: 'player-user-1', role: 'PLAYER' as const };

describe('invite — the notification says what is asking', () => {
  it('marks an invitation from a local team as one', async () => {
    const { service, notifications } = build('LOCAL_TEAM');

    await service.invite('manager-1', 'academy-1', DTO);

    expect(notifications.notify).toHaveBeenCalledWith(
      'player-user-1',
      'ACADEMY_JOIN_INVITATION',
      expect.objectContaining({ academyKind: 'LOCAL_TEAM', academyName: 'Yoshlik' }),
      expect.anything(),
    );
  });

  it('marks an invitation from an academy as one', async () => {
    const { service, notifications } = build('ACADEMY');

    await service.invite('manager-1', 'academy-1', DTO);

    expect(notifications.notify).toHaveBeenCalledWith(
      'player-user-1',
      'ACADEMY_JOIN_INVITATION',
      expect.objectContaining({ academyKind: 'ACADEMY' }),
      expect.anything(),
    );
  });

  /* Without it the client cannot tell the two apart and falls back to the
     academy wording, which is the bug this exists to prevent. */
  it('never sends the invitation without the kind', async () => {
    const { service, notifications } = build('LOCAL_TEAM');

    await service.invite('manager-1', 'academy-1', DTO);

    const [, , payload] = notifications.notify.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(payload).toHaveProperty('academyKind');
  });
});

describe('listMine — the invitations screen can tell them apart too', () => {
  it('asks for the kind alongside the name', async () => {
    const { service, prisma } = build('LOCAL_TEAM');

    await service.listMine('player-user-1');

    const [args] = prisma.academyInvitation.findMany.mock.calls[0] as unknown as [
      { include: { academy: { select: Record<string, boolean> } } },
    ];
    expect(args.include.academy.select.kind).toBe(true);
  });
});
