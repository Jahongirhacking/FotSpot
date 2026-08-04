import {
  generateUsername,
  normaliseUsername,
  USERNAME_MAX,
  validateUsername,
} from './username.util';

describe('generateUsername', () => {
  it('has the documented shape: colour-animal-football-number', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateUsername()).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{2,3}$/);
    }
  });

  it('always passes its own validator', () => {
    // The generator and the rules for a chosen handle must not disagree —
    // otherwise a user cannot re-save the name they were given.
    for (let i = 0; i < 200; i++) {
      expect(validateUsername(generateUsername())).toBeNull();
    }
  });

  it('spreads widely enough that collisions are the exception', () => {
    const handles = new Set(Array.from({ length: 500 }, generateUsername));
    expect(handles.size).toBeGreaterThan(495);
  });

  it('never emits something that needs escaping in a URL', () => {
    for (let i = 0; i < 200; i++) {
      const handle = generateUsername();
      expect(encodeURIComponent(handle)).toBe(handle);
    }
  });
});

describe('validateUsername', () => {
  it('accepts ordinary handles', () => {
    expect(validateUsername('joxa')).toBeNull();
    expect(validateUsername('amber-falcon-nutmeg-42')).toBeNull();
    expect(validateUsername('player10')).toBeNull();
  });

  it('treats case and a leading @ as noise, not as a different name', () => {
    // Normalised rather than rejected: someone typing back the handle they were
    // shown ("@Joxa") means `joxa`, and storing the normalised form is what makes
    // `Joxa` and `joxa` impossible to hold as two separate accounts.
    expect(validateUsername('Joxa')).toBeNull();
    expect(validateUsername('@joxa')).toBeNull();
  });

  it('rejects anything that would need encoding or could impersonate', () => {
    // A dot is the classic near-miss: `jo.xa` reads as `joxa` at a glance.
    expect(validateUsername('jo.xa')?.reason).toBe('shape');
    expect(validateUsername('jo_xa')?.reason).toBe('shape');
    expect(validateUsername('jo xa')?.reason).toBe('shape');
    expect(validateUsername('joxa/../admin')?.reason).toBe('shape');
    expect(validateUsername('joxa@fotspot')?.reason).toBe('shape');
  });

  it('rejects hyphens at the edges and doubled up', () => {
    expect(validateUsername('-joxa')?.reason).toBe('shape');
    expect(validateUsername('joxa-')?.reason).toBe('shape');
    expect(validateUsername('jo--xa')?.reason).toBe('shape');
  });

  it('rejects lengths that break the URL or the layout', () => {
    expect(validateUsername('ab')?.reason).toBe('too-short');
    expect(validateUsername('a'.repeat(USERNAME_MAX + 1))?.reason).toBe('too-long');
  });

  it('protects names the router and the product need', () => {
    // `/players/@me` resolving to a person would be a bug; an account called
    // `admin` is a phishing tool.
    expect(validateUsername('me')?.reason).toBe('reserved');
    expect(validateUsername('admin')?.reason).toBe('reserved');
    expect(validateUsername('fotspot')?.reason).toBe('reserved');
  });

  it('judges the normalised form, so case is not a loophole', () => {
    expect(validateUsername('  ADMIN  ')?.reason).toBe('reserved');
  });
});

describe('normaliseUsername', () => {
  it('accepts the handle with or without its @', () => {
    expect(normaliseUsername('@joxa')).toBe('joxa');
    expect(normaliseUsername('joxa')).toBe('joxa');
    expect(normaliseUsername('@@joxa')).toBe('joxa');
  });

  it('lowercases and trims, so a pasted handle still resolves', () => {
    expect(normaliseUsername('  @Joxa \n')).toBe('joxa');
  });
});
