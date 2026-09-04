/**
 * Run with `npx tsx --test lib/theme-reveal.spec.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { effectiveTheme, revealRadius } from './theme-reveal';

test('the circle reaches the farthest corner', () => {
  const viewport = { width: 1000, height: 600 };
  // From the top-right corner, the far corner is bottom-left: the diagonal.
  assert.equal(
    Math.round(revealRadius({ x: 1000, y: 0 }, viewport)),
    Math.round(Math.hypot(1000, 600)),
  );
  // From the centre, half the diagonal.
  assert.equal(
    Math.round(revealRadius({ x: 500, y: 300 }, viewport)),
    Math.round(Math.hypot(500, 300)),
  );
});

test('system follows the system; explicit choices are themselves', () => {
  assert.equal(effectiveTheme('system', true), 'dark');
  assert.equal(effectiveTheme('system', false), 'light');
  assert.equal(effectiveTheme('dark', false), 'dark');
  assert.equal(effectiveTheme('light', true), 'light');
});
