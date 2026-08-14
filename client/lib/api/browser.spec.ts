/**
 * The rule: a burst of expired-token requests must produce exactly one refresh.
 *
 * Not a style preference. The backend rotates the refresh token on use and treats
 * a second use of an already-rotated one as a replay, revoking the session. So
 * five parallel refreshes are one rotation and four replays, and the user is
 * signed out — which is what "the refresh token is not used automatically" was
 * actually reporting.
 *
 * Run with `npx tsx --test lib/api/browser.spec.ts` (the client has no test
 * runner wired up — see client/CLAUDE.md §9 — so this is deliberately plain
 * `node:test` with no config to add).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

type FetchArgs = Parameters<typeof fetch>;

/** A fake tab: cookies, a proxy that 401s until refreshed, and a call counter. */
function harness({ refreshSucceeds = true } = {}) {
  let accessValid = false;
  const calls = { refresh: 0, proxy: 0 };

  globalThis.document = { cookie: 'fs_roles=%5B%5D' } as Document;

  globalThis.fetch = (async (input: FetchArgs[0], init?: FetchArgs[1]) => {
    const url = String(input);

    if (url === '/api/auth/refresh') {
      calls.refresh += 1;
      // Deliberately slow, so every caller in the burst is still waiting when the
      // next one arrives. A synchronous stub would pass even without sharing.
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (refreshSucceeds) accessValid = true;
      return new Response('{}', { status: refreshSucceeds ? 200 : 401 });
    }

    calls.proxy += 1;
    void init;
    return accessValid
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : new Response('', { status: 401 });
  }) as typeof fetch;

  return calls;
}

test('five simultaneous 401s trigger one refresh and all five succeed', async () => {
  const calls = harness();
  const { browserFetch } = await import('./browser');

  const results = await Promise.all(
    ['/a', '/b', '/c', '/d', '/e'].map((path) => browserFetch<{ ok: boolean }>(path)),
  );

  assert.equal(calls.refresh, 1, 'exactly one refresh — more would be replays');
  assert.deepEqual(
    results.map((r) => r.ok),
    [true, true, true, true, true],
    'every request retried and succeeded',
  );
  // Five original attempts plus five retries.
  assert.equal(calls.proxy, 10);
});

test('a later expiry refreshes again rather than reusing a settled promise', async () => {
  const calls = harness();
  const { browserFetch } = await import('./browser');

  await browserFetch('/first');
  assert.equal(calls.refresh, 1);

  // A second burst, after the first has settled, must be able to refresh again —
  // a shared promise that is never released would make one refresh the only one
  // this tab ever performs.
  globalThis.fetch = (async (input: FetchArgs[0]) => {
    const url = String(input);
    if (url === '/api/auth/refresh') {
      calls.refresh += 1;
      return new Response('{}', { status: 200 });
    }
    return calls.refresh >= 2
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : new Response('', { status: 401 });
  }) as typeof fetch;

  await browserFetch('/second');
  assert.equal(calls.refresh, 2);
});

test('a dead refresh token does not loop', async () => {
  const calls = harness({ refreshSucceeds: false });
  globalThis.window = { location: { href: '', pathname: '/feed' } } as Window & typeof globalThis;
  const { browserFetch } = await import('./browser');

  await assert.rejects(() => browserFetch('/a'), /session has expired/i);
  // One refresh attempt, one original request, and no retry: retrying a request
  // whose token could not be renewed is the loop this guards against.
  assert.equal(calls.refresh, 1);
  assert.equal(calls.proxy, 1);
});
