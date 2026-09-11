import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AuditAction } from '../audit/audit.actions';
import { AdminController } from './admin.controller';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

/**
 * Messages from an admin to a user: written once, delivered as a notification,
 * kept as the admin's history. The user never gets anything but the text and
 * who wrote it; the admin's list never shows anything an admin did not send.
 */

const PERSON = {
  id: 'user-1',
  firstName: 'Ali',
  lastName: 'Valiyev',
  username: 'ali',
  avatarKey: 'public/avatars/ali.jpg',
};
const ADMIN = {
  id: 'admin-1',
  firstName: 'Super',
  lastName: 'Admin',
  username: null,
  avatarKey: null,
};

function build() {
  const created = {
    id: 'msg-1',
    body: 'Salom, Ali',
    createdAt: new Date('2026-09-11T10:00:00.000Z'),
    sender: ADMIN,
    recipient: PERSON,
  };
  const prisma = {
    user: {
      findUnique: jest.fn(async (): Promise<unknown> => ({ ...PERSON, isActive: true })),
      findMany: jest.fn(async (): Promise<unknown[]> => [PERSON]),
    },
    adminMessage: {
      create: jest.fn(async (): Promise<unknown> => created),
      findFirst: jest.fn(async (): Promise<unknown> => created),
      findMany: jest.fn(async (): Promise<unknown[]> => [created]),
      count: jest.fn(async () => 1),
    },
    $queryRaw: jest.fn(async (..._args: unknown[]): Promise<unknown[]> => []),
  };
  const storage = {
    publicUrlOrNull: (key: string | null) => (key ? `https://cdn.example/${key}` : null),
  };
  const notifications = { notify: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new AdminService(
    prisma as never,
    storage as never,
    {} as never,
    {} as never,
    {} as never,
    notifications as never,
    audit as never,
    {} as never,
  );
  return { service, prisma, notifications, audit, created };
}

describe('sending a message', () => {
  it('stores it, notifies the recipient with the text, and audits it', async () => {
    const { service, prisma, notifications, audit } = build();

    const message = await service.sendMessage('admin-1', {
      recipientUserId: 'user-1',
      body: '  Salom, Ali  ',
    });

    expect(prisma.adminMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { senderUserId: 'admin-1', recipientUserId: 'user-1', body: 'Salom, Ali' },
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      'user-1',
      'ADMIN_MESSAGE',
      { message: 'Salom, Ali', messageId: 'msg-1' },
      { userId: 'admin-1', role: 'admin' },
    );
    expect(audit.record).toHaveBeenCalledWith(
      'admin-1',
      AuditAction.ADMIN_MESSAGE_SENT,
      expect.objectContaining({ messageId: 'msg-1', recipientUserId: 'user-1' }),
    );
    expect(message.recipient).toEqual({
      id: 'user-1',
      firstName: 'Ali',
      lastName: 'Valiyev',
      username: 'ali',
      avatarUrl: 'https://cdn.example/public/avatars/ali.jpg',
    });
    expect(JSON.stringify(message)).not.toContain('avatarKey');
  });

  it('refuses an empty message, an unknown user, and writing to yourself', async () => {
    const { service, prisma, notifications } = build();
    await expect(
      service.sendMessage('admin-1', { recipientUserId: 'user-1', body: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.sendMessage('admin-1', { recipientUserId: 'nope', body: 'hi' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', isActive: true });
    await expect(
      service.sendMessage('admin-1', { recipientUserId: 'admin-1', body: 'hi' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

describe('the history', () => {
  it('lists one row per person written to, newest first, with the last message and a count', async () => {
    const { service, prisma, created } = build();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ recipientUserId: 'user-1', lastAt: created.createdAt, count: 3 }])
      .mockResolvedValueOnce([{ total: 7 }]);

    const page = await service.listChats({ page: 2, pageSize: 5 });

    const [statement] = prisma.$queryRaw.mock.calls[0] as unknown as [
      { strings: string[]; values: unknown[] },
    ];
    expect(statement.strings.join('?')).toMatch(
      /GROUP BY "recipientUserId"[\s\S]*ORDER BY MAX\("createdAt"\) DESC/,
    );
    expect(statement.values).toEqual([5, 5]);
    expect(page.total).toBe(7);
    expect(page.page).toBe(2);
    expect(page.items[0]).toEqual({
      user: expect.objectContaining({ id: 'user-1', firstName: 'Ali' }),
      messageCount: 3,
      lastAt: created.createdAt,
      lastMessage: {
        id: 'msg-1',
        body: 'Salom, Ali',
        createdAt: created.createdAt,
        sender: expect.objectContaining({ id: 'admin-1' }),
      },
    });
  });

  it('a thread is one person’s messages, newest first, paginated', async () => {
    const { service, prisma } = build();

    const thread = await service.listThread('user-1', { page: 1, pageSize: 20 });

    expect(prisma.adminMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientUserId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      }),
    );
    expect(thread.user.id).toBe('user-1');
    expect(thread.items[0].body).toBe('Salom, Ali');
    expect(thread.total).toBe(1);
  });

  it('a thread for an unknown user is a 404', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.listThread('nope', {})).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('routes', () => {
  const rolesOn = (handler: keyof AdminController) =>
    (Reflect.getMetadata(ROLES_KEY, AdminController.prototype[handler]) as string[] | undefined) ??
    (Reflect.getMetadata(ROLES_KEY, AdminController) as string[] | undefined);

  it('messaging is for both admin roles', () => {
    expect(rolesOn('sendMessage')).toEqual(['admin', 'super_admin']);
    expect(rolesOn('listChats')).toEqual(['admin', 'super_admin']);
    expect(rolesOn('listThread')).toEqual(['admin', 'super_admin']);
  });
});
