import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_KEYWORDS, mergeKeywords } from './seo-keywords';

describe('mergeKeywords', () => {
  it('splits a pasted comma list into trimmed keywords', () => {
    assert.deepEqual(mergeKeywords([], 'shurtan, klub, futbol akademiyasi'), [
      'shurtan',
      'klub',
      'futbol akademiyasi',
    ]);
  });

  it('drops the empty parts left by doubled, leading and trailing commas', () => {
    assert.deepEqual(mergeKeywords([], ',shurtan,, klub,   futbol,'), [
      'shurtan',
      'klub',
      'futbol',
    ]);
    assert.deepEqual(mergeKeywords(['a'], ' , ,'), ['a']);
    assert.deepEqual(mergeKeywords([], ''), []);
  });

  it('collapses inner whitespace and keeps one spelling of a duplicate', () => {
    assert.deepEqual(mergeKeywords(['Shurtan'], 'shurtan, youth   football, Youth Football'), [
      'Shurtan',
      'youth football',
    ]);
  });

  it('drops an over-long part and stops at the keyword limit', () => {
    assert.deepEqual(mergeKeywords([], `${'x'.repeat(61)}, ok`), ['ok']);
    const many = Array.from({ length: MAX_KEYWORDS + 5 }, (_, i) => `k${i}`).join(', ');
    assert.equal(mergeKeywords([], many).length, MAX_KEYWORDS);
  });
});
