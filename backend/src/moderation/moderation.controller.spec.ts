import { ModerationController } from './moderation.controller';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

/**
 * Who may press what on the moderation routes — read off the decorators, so
 * a gate that was widened or narrowed by accident is a failing test rather
 * than a surprise in production. `RolesGuard` reads exactly this metadata.
 */
const rolesOn = (handler: keyof ModerationController) =>
  Reflect.getMetadata(ROLES_KEY, ModerationController.prototype[handler]) as string[] | undefined;

describe('moderation routes — who may press what', () => {
  it('lets both admin roles process a clip again, like verify and block', () => {
    expect(rolesOn('retryFailedMedia')).toEqual(['admin', 'super_admin']);
    expect(rolesOn('verifyMedia')).toEqual(['admin', 'super_admin']);
    expect(rolesOn('blockMedia')).toEqual(['admin', 'super_admin']);
  });

  it('keeps destruction to the super admin', () => {
    expect(rolesOn('deleteMedia')).toEqual(['super_admin']);
  });

  it('lets both admin roles list clips by processing status', () => {
    expect(rolesOn('listMedia')).toEqual(['admin', 'super_admin']);
  });
});
