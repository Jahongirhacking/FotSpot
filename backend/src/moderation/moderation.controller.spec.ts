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

  it('keeps taking a live clip down, and putting a blocked one back, to the super admin', () => {
    expect(rolesOn('blockActiveMedia')).toEqual(['super_admin']);
    expect(rolesOn('unblockMedia')).toEqual(['super_admin']);
  });

  it('lets both admin roles clear or finish a takedown on a flagged clip', () => {
    expect(rolesOn('restoreFlaggedMedia')).toEqual(['admin', 'super_admin']);
    expect(rolesOn('removeFlaggedMedia')).toEqual(['admin', 'super_admin']);
  });

  it('lets both admin roles rate, re-file, and answer appeals', () => {
    expect(rolesOn('rateMedia')).toEqual(['admin', 'super_admin']);
    expect(rolesOn('recategoriseMedia')).toEqual(['admin', 'super_admin']);
    expect(rolesOn('listAppeals')).toEqual(['admin', 'super_admin']);
    expect(rolesOn('resolveAppeal')).toEqual(['admin', 'super_admin']);
  });

  it('lets both admin roles list clips by processing status', () => {
    expect(rolesOn('listMedia')).toEqual(['admin', 'super_admin']);
  });
});
