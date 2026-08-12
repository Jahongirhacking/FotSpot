import { BadRequestException } from '@nestjs/common';
import { SOCIAL_FIELDS, normaliseSocialUrl } from './social-links.util';

/**
 * These values become an `href` on a public academy page, under an icon that
 * claims which platform the reader is about to visit. A link that says Instagram
 * and goes elsewhere is the shape of a phishing link, and this page is edited by
 * anybody holding a manager account.
 */
describe('normaliseSocialUrl', () => {
  it('accepts each platform on its own domain', () => {
    expect(normaliseSocialUrl('telegramUrl', 'https://t.me/fotspot')).toBe('https://t.me/fotspot');
    expect(normaliseSocialUrl('facebookUrl', 'https://facebook.com/fotspot')).toBe(
      'https://facebook.com/fotspot',
    );
    expect(normaliseSocialUrl('instagramUrl', 'https://instagram.com/fotspot')).toBe(
      'https://instagram.com/fotspot',
    );
    expect(normaliseSocialUrl('youtubeUrl', 'https://youtu.be/abc123')).toBe(
      'https://youtu.be/abc123',
    );
  });

  it('refuses a link to the wrong platform', () => {
    // The whole point of four named fields: the icon has to tell the truth.
    expect(() => normaliseSocialUrl('instagramUrl', 'https://evil.example/phish')).toThrow(
      BadRequestException,
    );
    expect(() => normaliseSocialUrl('telegramUrl', 'https://facebook.com/fotspot')).toThrow(
      BadRequestException,
    );
  });

  it('is not fooled by a lookalike host', () => {
    // `instagram.com.evil.example` ends with neither `instagram.com` nor
    // `.instagram.com`, and a naive `includes` would have let it through.
    expect(() => normaliseSocialUrl('instagramUrl', 'https://instagram.com.evil.example/x')).toThrow(
      BadRequestException,
    );
    expect(() => normaliseSocialUrl('facebookUrl', 'https://notfacebook.com/x')).toThrow(
      BadRequestException,
    );
  });

  it('refuses a scheme that is not http(s)', () => {
    // The reason the scheme is checked at all: this lands in an href.
    expect(() => normaliseSocialUrl('telegramUrl', 'javascript:alert(1)')).toThrow(
      BadRequestException,
    );
    expect(() => normaliseSocialUrl('youtubeUrl', 'data:text/html,<script>')).toThrow(
      BadRequestException,
    );
  });

  it('accepts subdomains and strips www', () => {
    expect(normaliseSocialUrl('youtubeUrl', 'https://m.youtube.com/@fotspot')).toBe(
      'https://m.youtube.com/@fotspot',
    );
    expect(normaliseSocialUrl('facebookUrl', 'https://www.facebook.com/fotspot')).toBe(
      'https://facebook.com/fotspot',
    );
  });

  it('adds a scheme to something pasted from a phone', () => {
    expect(normaliseSocialUrl('telegramUrl', 't.me/fotspot')).toBe('https://t.me/fotspot');
  });

  it('treats an empty value as clearing the link', () => {
    // How a manager removes one. Refusing it would leave them unable to.
    for (const field of SOCIAL_FIELDS) {
      expect(normaliseSocialUrl(field, '')).toBeNull();
      expect(normaliseSocialUrl(field, '   ')).toBeNull();
    }
  });

  it('drops the fragment so two spellings of one page store the same', () => {
    expect(normaliseSocialUrl('instagramUrl', 'https://instagram.com/fotspot#about')).toBe(
      'https://instagram.com/fotspot',
    );
  });
});
