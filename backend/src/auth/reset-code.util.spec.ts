import { generateResetCode, normaliseResetCode } from './reset-code.util';

describe('generateResetCode', () => {
  it('is eight characters of unambiguous uppercase and digits', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateResetCode()).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    }
  });

  it('never emits a character that is misread when retyped', () => {
    // 0/O and 1/I/L are the pairs people get wrong copying from a phone screen —
    // and a wrong-looking-right code burns a throttle attempt.
    const sample = Array.from({ length: 500 }, generateResetCode).join('');
    expect(sample).not.toMatch(/[01OIL]/);
  });

  it('does not repeat', () => {
    const codes = new Set(Array.from({ length: 500 }, generateResetCode));
    expect(codes.size).toBe(500);
  });

  it('draws uniformly — no character starved by modulo bias', () => {
    const counts = new Map<string, number>();
    for (const char of Array.from({ length: 800 }, generateResetCode).join('')) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    // 31 symbols over 6400 draws: ~206 expected each. A biased `byte % 31`
    // starves the tail of the alphabet, which this catches.
    expect(counts.size).toBe(31);
    expect(Math.min(...counts.values())).toBeGreaterThan(120);
  });
});

describe('normaliseResetCode', () => {
  it('forgives how the code was copied, not what it says', () => {
    expect(normaliseResetCode('k7f3 m9qx')).toBe('K7F3M9QX');
    expect(normaliseResetCode('K7F3-M9QX')).toBe('K7F3M9QX');
    expect(normaliseResetCode('  K7F3M9QX \n')).toBe('K7F3M9QX');
  });

  it('leaves a genuinely different code different', () => {
    expect(normaliseResetCode('K7F3M9QX')).not.toBe(normaliseResetCode('K7F3M9QY'));
  });
});
