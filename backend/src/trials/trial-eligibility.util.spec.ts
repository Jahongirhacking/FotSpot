import { BadRequestException } from '@nestjs/common';
import {
  assertGenderEligible,
  genderIneligibilityMessage,
  isGenderEligible,
} from './trial-eligibility.util';

/**
 * Who a trial is for. The six combinations the rule is made of, and the shape
 * of the refusal every entry point shares.
 */
describe('isGenderEligible — the six combinations', () => {
  it.each([
    ['male', 'male', true],
    ['male', 'female', false],
    ['female', 'female', true],
    ['female', 'male', false],
    ['general', 'male', true],
    ['general', 'female', true],
  ])('a %s trial and a %s player → %s', (trial, player, eligible) => {
    expect(isGenderEligible(trial, player)).toBe(eligible);
  });

  /* A profile's gender is a string the player typed; the rule is not a
     spelling test. */
  it('compares without regard to case or whitespace', () => {
    expect(isGenderEligible('female', ' Female ')).toBe(true);
    expect(isGenderEligible('MALE', 'male')).toBe(true);
  });

  it('refuses a player whose gender is missing from a single-gender trial', () => {
    expect(isGenderEligible('female', '')).toBe(false);
    expect(isGenderEligible('male', null)).toBe(false);
  });

  /* Refusing everyone over a value nobody can see would be the worse failure. */
  it('treats an unrecognised trial gender as open', () => {
    expect(isGenderEligible('mixed', 'male')).toBe(true);
    expect(isGenderEligible(undefined, 'female')).toBe(true);
  });
});

describe('assertGenderEligible — the refusal', () => {
  it('is the 400 the rest of the application flow uses, with a sentence to act on', () => {
    expect(() => assertGenderEligible({ gender: 'female' }, { gender: 'male' })).toThrow(
      BadRequestException,
    );
    expect(() => assertGenderEligible({ gender: 'female' }, { gender: 'male' })).toThrow(
      'This trial is for female players only.',
    );
  });

  it('says male for a male trial', () => {
    expect(genderIneligibilityMessage('male')).toBe('This trial is for male players only.');
  });

  it('lets an eligible player through silently', () => {
    expect(() => assertGenderEligible({ gender: 'general' }, { gender: 'male' })).not.toThrow();
    expect(() => assertGenderEligible({ gender: 'male' }, { gender: 'male' })).not.toThrow();
  });
});
