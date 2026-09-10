import { isValidSlug, slugify, uniqueSlug, MAX_SLUG_LENGTH } from './blog-slug.util';

describe('slugify', () => {
  it('lowercases, joins words with hyphens and drops punctuation', () => {
    expect(slugify('Yangi akademiya Toshkentda ochildi!')).toBe(
      'yangi-akademiya-toshkentda-ochildi',
    );
    expect(slugify('  FotSpot 2.0 — what changed?  ')).toBe('fotspot-2-0-what-changed');
  });

  it('transliterates Cyrillic so a Russian headline still reads', () => {
    expect(slugify('Новая академия открылась в Ташкенте')).toBe(
      'novaya-akademiya-otkrylas-v-tashkente',
    );
    expect(slugify('Ёш футболчилар')).toBe('yosh-futbolchilar');
  });

  it('handles Uzbek letters as people type them in an address bar', () => {
    expect(slugify("O'zbekiston yoshlar terma jamoasi")).toBe('ozbekiston-yoshlar-terma-jamoasi');
    expect(slugify('Gʻalaba va oʻyin')).toBe('galaba-va-oyin');
    expect(slugify('Тошкент ўқувчилари')).toBe('toshkent-oquvchilari');
  });

  it('strips diacritics', () => {
    expect(slugify('Café Müller ş')).toBe('cafe-muller-s');
  });

  it('never exceeds the maximum, and cuts at a word', () => {
    const long = slugify('word '.repeat(40));
    expect(long.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(long.endsWith('-')).toBe(false);
    expect(long.endsWith('word')).toBe(true);
  });

  it('is empty for a title with nothing usable', () => {
    expect(slugify('!!! ???')).toBe('');
  });
});

describe('isValidSlug', () => {
  it.each(['a', 'yangi-akademiya', 'fotspot-2-0'])('accepts %s', (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });
  it.each(['', 'Has Caps', 'double--hyphen', '-leading', 'trailing-', 'ünïcode', 'a b'])(
    'refuses %s',
    (slug) => {
      expect(isValidSlug(slug)).toBe(false);
    },
  );
});

describe('uniqueSlug', () => {
  it('keeps the base when it is free', async () => {
    await expect(uniqueSlug('new-trial', async () => false)).resolves.toBe('new-trial');
  });

  it('counts up rather than appending noise', async () => {
    const existing = new Set(['new-trial', 'new-trial-2']);
    await expect(uniqueSlug('new-trial', async (s) => existing.has(s))).resolves.toBe(
      'new-trial-3',
    );
  });

  it('falls back to "post" for an empty base', async () => {
    await expect(uniqueSlug('', async () => false)).resolves.toBe('post');
  });
});
