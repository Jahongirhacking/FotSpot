import { BadRequestException } from '@nestjs/common';

import { AcademiesService } from './academies.service';

/**
 * The handle as the *service* treats it: what it normalises, what it refuses,
 * and what it leaves alone.
 *
 * These sit beside `academy-username.util.spec.ts`, which owns the shape rules.
 * What is asserted here is the wiring — that the service applies that
 * normalisation before the value can reach the unique index, and that an absent
 * field, an empty field and a bad field are three different requests.
 *
 * Uniqueness deliberately has no unit test. It is a database guarantee, and a
 * faked Prisma asserting "we would have thrown P2002" would only be testing the
 * fake. It was verified against a real Postgres instead — including two
 * concurrent transactions racing for one handle, where both read it as free and
 * the index rejected the loser.
 */

type HandleFor = (username: string | undefined) => { username?: string | null };

const handleFor = (AcademiesService.prototype as unknown as { handleFor: HandleFor }).handleFor;

describe('the handle a PATCH is allowed to store', () => {
  /*
   * Three distinct requests, and the difference matters: PATCH reads an absent
   * field as "leave it alone", so an academy saving its phone number must not
   * have its handle cleared as a side effect.
   */
  it('leaves the stored handle alone when the field is absent', () => {
    expect(handleFor(undefined)).toEqual({});
  });

  it('clears the handle for an empty string, which is how a manager gives one up', () => {
    expect(handleFor('')).toEqual({ username: null });
    expect(handleFor('   ')).toEqual({ username: null });
    expect(handleFor('@')).toEqual({ username: null });
  });

  it('stores a valid handle normalised', () => {
    expect(handleFor('bunyodkorfc_academy')).toEqual({ username: 'bunyodkorfc_academy' });
  });

  /*
   * The normalisation that protects the unique index. Without it the index would
   * treat `@Shurtan_Academy` and `shurtan_academy` as two different handles, and
   * two academies could hold what every reader would see as one name.
   */
  it.each([
    ['a leading sigil', '@shurtan_academy'],
    ['uppercase', 'SHURTAN_ACADEMY'],
    ['surrounding whitespace', '  shurtan_academy  '],
    ['all three at once', '  @Shurtan_ACADEMY '],
  ])('normalises %s before it can reach the index', (_why, input) => {
    expect(handleFor(input)).toEqual({ username: 'shurtan_academy' });
  });

  /* Rejected with a reason the manager can act on, not a generic 400. */
  it.each([
    ['a hyphen', 'bunyodkor-fc-academy', /underscores/i],
    ['no suffix', 'bunyodkorfc', /must end in "academy"/i],
    ['only the suffix', 'academy_academy', /own name/i],
    ['too short', 'ab', /too short/i],
  ])('refuses %s with a usable message', (_why, input, expected) => {
    expect(() => handleFor(input)).toThrow(BadRequestException);
    expect(() => handleFor(input)).toThrow(expected);
  });

  /*
   * A handle is never invented. `suggestAcademyUsername` exists for the form to
   * offer one, but nothing on the write path may call it — a handle appears in a
   * public URL and is the manager's to choose.
   */
  it('never fabricates a handle from nothing', () => {
    expect(handleFor('')).toEqual({ username: null });
    expect(handleFor(undefined)).toEqual({});
  });
});
