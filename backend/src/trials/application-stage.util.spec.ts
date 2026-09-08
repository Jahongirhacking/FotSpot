import { applicationStage } from './application-stage.util';

/**
 * The seven stages an academy reads an applicant in, derived from the
 * application, the verdict, the squad invitation and the membership — because
 * after a PASS the story continues in two other tables.
 */
const base = {
  trialType: 'GENERAL' as const,
  verdict: null,
  squadInvitation: null,
  member: false,
};

describe('applicationStage', () => {
  it.each(['APPLIED', 'INVITED', 'CONFIRMED'] as const)('%s is pending', (status) => {
    expect(applicationStage({ ...base, status })).toBe('PENDING');
  });

  it('reads the verdict', () => {
    expect(applicationStage({ ...base, status: 'FAILED', verdict: 'FAIL' })).toBe('FAILED');
    expect(applicationStage({ ...base, status: 'PASSED', verdict: 'PASS' })).toBe('PASSED');
  });

  it('a closed candidacy is a no from the academy after a pass', () => {
    expect(applicationStage({ ...base, status: 'REJECTED', verdict: 'PASS' })).toBe(
      'CANDIDACY_CLOSED',
    );
  });

  it('a no without a verdict on a private trial is the player declining the invitation', () => {
    expect(applicationStage({ ...base, status: 'REJECTED', trialType: 'PRIVATE' })).toBe(
      'INVITATION_DECLINED',
    );
    // On a global trial nobody was invited, so the no is the academy's.
    expect(applicationStage({ ...base, status: 'REJECTED' })).toBe('CANDIDACY_CLOSED');
  });

  describe('after the squad invitation', () => {
    const offered = { ...base, status: 'ACCEPTED' as const, verdict: 'PASS' as const };

    it('is waiting on the player while the invitation is pending', () => {
      expect(applicationStage({ ...offered, squadInvitation: { status: 'PENDING' } })).toBe(
        'SQUAD_INVITED',
      );
      expect(applicationStage(offered)).toBe('SQUAD_INVITED');
    });

    it('is joined once the player is on the books, or has said yes', () => {
      expect(applicationStage({ ...offered, member: true })).toBe('SQUAD_JOINED');
      expect(applicationStage({ ...offered, squadInvitation: { status: 'ACCEPTED' } })).toBe(
        'SQUAD_JOINED',
      );
    });

    it('is declined when the player said no', () => {
      expect(applicationStage({ ...offered, squadInvitation: { status: 'REJECTED' } })).toBe(
        'INVITATION_DECLINED',
      );
    });

    it('is closed when the manager withdrew the invitation', () => {
      expect(applicationStage({ ...offered, squadInvitation: { status: 'CANCELLED' } })).toBe(
        'CANDIDACY_CLOSED',
      );
    });
  });
});
