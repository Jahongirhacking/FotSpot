import { BadRequestException } from '@nestjs/common';
import { normaliseContactPhone } from './contact-phone.util';

describe('normaliseContactPhone', () => {
  it('keeps a number already in E.164', () => {
    expect(normaliseContactPhone('+998901234567')).toBe('+998901234567');
  });

  it('drops the spaces, dashes and brackets people type between the digits', () => {
    expect(normaliseContactPhone('+998 (90) 123-45-67')).toBe('+998901234567');
    expect(normaliseContactPhone(' +44 7700 900123 ')).toBe('+447700900123');
  });

  it('treats an empty value as clearing the number', () => {
    expect(normaliseContactPhone('')).toBeNull();
    expect(normaliseContactPhone('   ')).toBeNull();
  });

  it.each(['998901234567', '0901234567', '+0901234567', '+998 90 abc', '+12', '+1234567890123456'])(
    'refuses %s rather than guessing a country',
    (value) => {
      expect(() => normaliseContactPhone(value)).toThrow(BadRequestException);
    },
  );
});
