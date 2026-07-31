import { generatePassword, generateUsername, slugify } from './manager-credentials.util';

describe('slugify', () => {
  it('strips spaces, punctuation and case', () => {
    expect(slugify('FC Bunyodkor')).toBe('fcbunyodkor');
    expect(slugify("Yoshlik-2010 (Toshkent)")).toBe('yoshliktoshkent');
  });

  it('transliterates Cyrillic rather than dropping it', () => {
    expect(slugify('Бунёдкор')).toBe('bunyodkor');
    expect(slugify('Пахтакор')).toBe('pahtakor');
  });

  it("drops the Uzbek turned comma so 'Oʻzbekiston' stays typable", () => {
    expect(slugify('Oʻzbekiston')).toBe('ozbekiston');
  });

  it('never emits a character outside the safe alphabet', () => {
    const slug = slugify('Академия «Металлург» №1');
    expect(slug).toMatch(/^[a-z]*$/);
  });

  it('falls back rather than producing an empty username', () => {
    expect(generateUsername('!!!')).toMatch(/^academy\.[a-z0-9]{4}$/);
  });
});

describe('generateUsername', () => {
  it('is typable: lowercase latin, one dot, no ambiguous digits', () => {
    expect(generateUsername('FC Bunyodkor')).toMatch(/^fcbunyodkor\.[23456789a-z]{4}$/);
  });

  it('differs between two academies of the same name', () => {
    // Same-name academies in different regions are expected, not exceptional.
    const names = new Set(Array.from({ length: 50 }, () => generateUsername('Yoshlik')));
    expect(names.size).toBeGreaterThan(45);
  });

  it('excludes 0/1 and o/l, which get misread when dictated over the phone', () => {
    const suffixes = Array.from({ length: 200 }, () => generateUsername('x').split('.')[1]);
    expect(suffixes.join('')).not.toMatch(/[01lio]/);
  });
});

describe('generatePassword', () => {
  it('is 14 characters from the unambiguous alphabet', () => {
    expect(generatePassword()).toMatch(/^[A-HJ-NP-Za-km-z2-9]{14}$/);
  });

  it('does not repeat', () => {
    const passwords = new Set(Array.from({ length: 200 }, generatePassword));
    expect(passwords.size).toBe(200);
  });

  it('draws roughly uniformly — no character starved by modulo bias', () => {
    const counts = new Map<string, number>();
    for (const char of Array.from({ length: 500 }, generatePassword).join('')) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    // 57 characters over 7000 draws: ~123 expected each. A biased implementation
    // (`byte % 57`) starves the tail of the alphabet, which this catches.
    expect(counts.size).toBe(57);
    expect(Math.min(...counts.values())).toBeGreaterThan(50);
  });
});
