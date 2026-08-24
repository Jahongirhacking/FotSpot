import { ForbiddenException } from '@nestjs/common';

import { AcademiesService } from './academies.service';
import { normaliseKeywords } from '../common/seo-keywords.util';

/**
 * Who may write an academy's SEO keywords.
 *
 * The interesting part is that the *route* cannot answer this. `POST /academies`
 * admits `admin` and `super_admin`, and `PATCH /academies/:id` admits the
 * academy's own manager too — so the role gate is already satisfied by people §8
 * says must not touch this field. The check has to be on the field, and this is
 * what holds it there.
 *
 * `keywordsFor` is private, so these reach it the way TypeScript allows a test
 * to: through the instance, with the shape it actually has. Exporting it purely
 * for testing would widen the service's surface for no other reader.
 */

type KeywordsFor = (keywords: string[] | undefined, isSuperAdmin: boolean) => { seoKeywords?: string[] };

const keywordsFor = (AcademiesService.prototype as unknown as { keywordsFor: KeywordsFor })
  .keywordsFor;

describe('who may set an academy’s SEO keywords', () => {
  it('lets a super admin set them', () => {
    expect(keywordsFor(['tashkent football academy'], true)).toEqual({
      seoKeywords: ['tashkent football academy'],
    });
  });

  /*
   * The case the route guard cannot catch. An ordinary admin onboards academies
   * and may correct them — `@Roles('admin', 'super_admin')` lets them through —
   * but §8 reserves the metadata to a super admin.
   */
  it('refuses an ordinary admin', () => {
    expect(() => keywordsFor(['anything'], false)).toThrow(ForbiddenException);
  });

  /*
   * And the manager: `PATCH /academies/:id` carries no `@Roles` at all, because
   * a manager edits their own academy through it.
   */
  it('refuses an academy manager', () => {
    expect(() => keywordsFor([], false)).toThrow(ForbiddenException);
  });

  /*
   * Refused loudly, not dropped. A caller who sent keywords and got a 200 back
   * would reasonably believe they were saved.
   */
  it('throws rather than silently discarding the field', () => {
    expect(() => keywordsFor(['x'], false)).toThrow(/super admin/i);
  });

  /*
   * A manager saving their description must still work — they simply do not send
   * the field, and an absent field is not an attempt to write it.
   */
  it('lets anybody save when the field is absent entirely', () => {
    expect(keywordsFor(undefined, false)).toEqual({});
    expect(keywordsFor(undefined, true)).toEqual({});
  });

  /* An absent field must leave what is stored alone, which an empty fragment
     does — `{ seoKeywords: undefined }` would too, but says less. */
  it('returns an empty fragment for an absent field, not an undefined value', () => {
    expect(Object.keys(keywordsFor(undefined, true))).toEqual([]);
  });

  it('normalises what a super admin sends', () => {
    expect(keywordsFor(['  Youth  Football ', 'youth football', ''], true)).toEqual({
      seoKeywords: ['Youth Football'],
    });
  });

  /* Clearing the list is a legitimate edit and must not be mistaken for absence. */
  it('lets a super admin clear the list', () => {
    expect(keywordsFor([], true)).toEqual({ seoKeywords: [] });
  });
});

/*
 * Trials take the other half of §8: no gate of their own, because creating or
 * editing one is already `assertAcademyManager`. What they share with academies
 * is the normalisation, so a keyword list cannot become stuffing on either.
 */
describe('trial keywords use the same normalisation', () => {
  it('de-duplicates and trims the same way', () => {
    expect(normaliseKeywords(['U16 Trial', 'u16 trial', '  ', 'youth  football'])).toEqual([
      'U16 Trial',
      'youth football',
    ]);
  });
});
