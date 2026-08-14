import { ForbiddenException } from '@nestjs/common';
import { AcademyKind } from '@prisma/client';
import { assertNotLocalTeam, isLocalTeam } from './academy-kind.util';

describe('academy-kind.util', () => {
  describe('isLocalTeam', () => {
    it('is true only for LOCAL_TEAM', () => {
      expect(isLocalTeam(AcademyKind.LOCAL_TEAM)).toBe(true);
      expect(isLocalTeam(AcademyKind.ACADEMY)).toBe(false);
    });
  });

  describe('assertNotLocalTeam', () => {
    it('lets an academy through', () => {
      expect(() => assertNotLocalTeam(AcademyKind.ACADEMY, 'hold trials')).not.toThrow();
    });

    it('refuses a local team', () => {
      expect(() => assertNotLocalTeam(AcademyKind.LOCAL_TEAM, 'hold trials')).toThrow(
        ForbiddenException,
      );
    });

    /*
     * 403 and not 400: the caller is who they say they are and the request is
     * well formed — their organisation simply does not do this. A 400 would
     * read as "you sent something wrong", which sends a manager looking for a
     * typo that is not there.
     */
    it('refuses with Forbidden rather than a validation error', () => {
      let thrown: unknown;
      try {
        assertNotLocalTeam(AcademyKind.LOCAL_TEAM, 'have coaches');
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ForbiddenException);
      expect((thrown as ForbiddenException).getStatus()).toBe(403);
    });

    /** The message names the refused action, so the screen can be identified. */
    it('names the action in the message', () => {
      expect(() => assertNotLocalTeam(AcademyKind.LOCAL_TEAM, 'have coaches')).toThrow(
        /cannot have coaches/,
      );
    });
  });

  /**
   * The default is what keeps every existing academy on the existing path.
   *
   * Asserted against the generated enum rather than a string literal, so a
   * rename in the schema fails here instead of silently making every row a
   * local team.
   */
  it('treats the schema default as an academy', () => {
    expect(isLocalTeam(AcademyKind.ACADEMY)).toBe(false);
  });
});
