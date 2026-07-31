import * as crypto from 'crypto';

/**
 * Generates the sign-in credentials for an academy manager account created by an
 * admin (README §1.10).
 *
 * Pure and DI-free so the character sets and the ambiguity rules below can be
 * unit-tested without a database — see manager-credentials.util.spec.ts.
 */

/**
 * Latin lowercase only, and no digits that collide with letters.
 *
 * The username gets read aloud over a phone call or retyped from a screenshot of a
 * Telegram message — that is how a credential actually reaches an academy manager
 * in this market. Cyrillic and Latin `с`/`c`, `о`/`o`, `а`/`a` are visually
 * identical, so a slug carrying either would produce a login that looks correct and
 * fails forever.
 */
const USERNAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/** Excludes 0/O/o, 1/l/I — misreading one of these is the likeliest failure mode. */
const SUFFIX_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const SUFFIX_LENGTH = 4;
const PASSWORD_LENGTH = 14;
const MAX_SLUG_LENGTH = 20;

/**
 * Cyrillic → Latin for the academy names that will actually be typed in
 * ("Бунёдкор"), plus the Uzbek Latin letters that carry diacritics ("Oʻzbekiston").
 * Anything still unmapped is dropped rather than guessed.
 */
const TRANSLITERATION: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
  ʻ: '', ʼ: '', '‘': '', '’': '',
};

/** Uniform over `alphabet`, rejection-sampled so no character is more likely than another. */
function randomString(length: number, alphabet: string): string {
  let out = '';
  // 256 % 31 !== 0, so a plain `byte % length` would bias the first few characters.
  // The bias is small, but a password is exactly the wrong place to accept one.
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  while (out.length < length) {
    for (const byte of crypto.randomBytes(length * 2)) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/** "FC Bunyodkor" → "fcbunyodkor"; "Бунёдкор" → "bunyodkor". */
export function slugify(name: string): string {
  const lowered = name.toLowerCase();
  let out = '';

  for (const char of lowered) {
    if (USERNAME_ALPHABET.includes(char)) {
      out += char;
    } else if (char in TRANSLITERATION) {
      out += TRANSLITERATION[char];
    }
    // Everything else — spaces, digits, punctuation, unmapped scripts — is dropped.
  }

  return out.slice(0, MAX_SLUG_LENGTH);
}

/**
 * A username for the manager of `academyName`.
 *
 * The random suffix is not decoration: two academies called "Yoshlik" in different
 * regions is the expected case, not an edge case, and the caller retries on a
 * unique-constraint collision.
 */
export function generateUsername(academyName: string): string {
  const slug = slugify(academyName) || 'academy';
  return `${slug}.${randomString(SUFFIX_LENGTH, SUFFIX_ALPHABET)}`;
}

/**
 * A one-time password, shown to the admin once and never recoverable afterwards
 * (only its Argon2 hash is stored).
 *
 * 14 characters over a 57-character alphabet is ~81 bits — far past anything worth
 * attacking, and short enough to retype. The account is flagged
 * `mustChangePassword` because this password necessarily passes through a third
 * party (the admin, and whatever chat app they paste it into).
 */
export function generatePassword(): string {
  return randomString(PASSWORD_LENGTH, PASSWORD_ALPHABET);
}
