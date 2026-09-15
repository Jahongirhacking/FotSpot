import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PLAYING_STYLE_INFO } from './playing-styles';
import { ALL_PLAYING_STYLES, PLAYING_STYLES, PlayingStyles } from './schemas/player';

describe('playing styles', () => {
  it('offers the Creative Playmaker under both Forward and Midfield', () => {
    assert.ok(PLAYING_STYLES.Forward.includes(PlayingStyles.CREATIVE_PLAYMAKER));
    assert.ok(PLAYING_STYLES.Midfield.includes(PlayingStyles.CREATIVE_PLAYMAKER));
  });

  it('lists every style exactly once even when a style sits in two groups', () => {
    assert.equal(new Set(ALL_PLAYING_STYLES).size, ALL_PLAYING_STYLES.length);
    assert.deepEqual([...ALL_PLAYING_STYLES].sort(), Object.values(PlayingStyles).sort());
  });

  it('describes every style with its own text', () => {
    for (const style of ALL_PLAYING_STYLES) {
      const info = PLAYING_STYLE_INFO[style];
      assert.ok(info, `${style} has no info`);
      assert.equal(info.key, style);
    }
  });
});
