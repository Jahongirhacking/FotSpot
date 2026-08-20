/**
 * The auth bootstrap, case by case.
 *
 * The bug these exist for: a missing access token was read as "signed out" and
 * redirected to `/login` without ever looking at `fs_refresh` — before any page
 * rendered, so nothing on the client could rescue it. The single most important
 * assertion in this file is that a missing access token plus a valid refresh
 * token resolves to a *session*, never to unauthenticated.
 *
 * Run with `npx tsx --test lib/auth/bootstrap.spec.ts` (the client has no test
 * runner wired up — see client/CLAUDE.md §9 — so this is plain `node:test`, the
 * same arrangement as `lib/api/browser.spec.ts`).
 */
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import { resolveAuth } from './bootstrap';
import { isAccessTokenUsable } from './access-token';

/** A JWT with the given expiry. Unsigned — nothing here verifies signatures. */
function token(expiresInSeconds: number): string {
  const claims = { sub: 'user-1', exp: Math.floor(Date.now() / 1000) + expiresInSeconds };
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode(claims)}.signature`;
}

const VALID = () => token(15 * 60);
const EXPIRED = () => token(-60);

/** Counts calls so "exactly one refresh" is a fact rather than a hope. */
let refreshCalls: string[] = [];
let refreshReply: { status?: number; delayMs?: number; throws?: Error; body?: unknown } = {};

beforeEach(() => {
  refreshCalls = [];
  refreshReply = {};

  global.fetch = (async (url: string, init: RequestInit) => {
    refreshCalls.push(String(JSON.parse(String(init.body)).refreshToken));
    if (refreshReply.delayMs) await new Promise((r) => setTimeout(r, refreshReply.delayMs));
    if (refreshReply.throws) throw refreshReply.throws;

    const status = refreshReply.status ?? 200;
    const body =
      refreshReply.body ??
      (status === 200
        ? { accessToken: VALID(), refreshToken: 'refresh-2', roles: ['player'] }
        : { message: 'nope' });

    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
});

/** 1. Valid access + valid refresh → continue, and do NOT refresh. */
test('case 1: a valid access token is used as-is, with no refresh', async () => {
  const auth = await resolveAuth(VALID(), 'refresh-1');

  assert.equal(auth.status, 'authenticated');
  assert.deepEqual(refreshCalls, [], 'a valid token must never be rotated');
});

/** 2. Missing access + valid refresh → refresh, no /login. THE bug. */
test('case 2: a missing access token refreshes instead of signing out', async () => {
  const auth = await resolveAuth(undefined, 'refresh-1');

  assert.equal(auth.status, 'refreshed');
  assert.equal(refreshCalls.length, 1);
  assert.notEqual(auth.status, 'unauthenticated');
});

/** 3. Expired access + valid refresh → refresh, no /login. */
test('case 3: an expired access token refreshes rather than redirecting', async () => {
  const auth = await resolveAuth(EXPIRED(), 'refresh-1');

  assert.equal(auth.status, 'refreshed');
  assert.equal(refreshCalls.length, 1);
});

/** 4. Missing access + missing refresh → unauthenticated. */
test('case 4: nothing at all is unauthenticated, and costs no request', async () => {
  const auth = await resolveAuth(undefined, undefined);

  assert.equal(auth.status, 'unauthenticated');
  assert.deepEqual(refreshCalls, [], 'a signed-out visitor must not hit the API');
});

/** 5. Expired access + missing refresh → unauthenticated. */
test('case 5: an expired token with nothing to refresh from is unauthenticated', async () => {
  const auth = await resolveAuth(EXPIRED(), undefined);

  assert.equal(auth.status, 'unauthenticated');
  assert.deepEqual(refreshCalls, []);
});

/** 6 & 7. A refresh token the backend refuses ends the session. */
test('case 6: a rejected refresh token ends the session', async () => {
  refreshReply = { status: 401 };

  const auth = await resolveAuth(undefined, 'refresh-dead');

  assert.equal(auth.status, 'expired');
  assert.equal(refreshCalls.length, 1);
});

test('case 7: an expired access token with a dead refresh token ends the session', async () => {
  refreshReply = { status: 401 };

  assert.equal((await resolveAuth(EXPIRED(), 'refresh-dead')).status, 'expired');
});

/**
 * 8. Concurrency.
 *
 * The backend revokes a session when a rotated refresh token is presented twice,
 * so a burst that sends three refreshes is a burst that signs the user out. This
 * is the assertion that stops that being possible.
 */
test('case 8: a burst of expired requests produces exactly one refresh', async () => {
  refreshReply = { delayMs: 20 };

  const results = await Promise.all([
    resolveAuth(undefined, 'refresh-1'),
    resolveAuth(EXPIRED(), 'refresh-1'),
    resolveAuth(undefined, 'refresh-1'),
    resolveAuth(EXPIRED(), 'refresh-1'),
  ]);

  assert.equal(refreshCalls.length, 1, `expected one refresh, got ${refreshCalls.length}`);
  for (const auth of results) assert.equal(auth.status, 'refreshed');
});

/*
 * Two different visitors must never join each other's flight — one promise for
 * the whole module would hand whichever session resolved first to both of them.
 */
test('two sessions refreshing at once do not share a flight', async () => {
  refreshReply = { delayMs: 20 };

  await Promise.all([resolveAuth(undefined, 'refresh-A'), resolveAuth(undefined, 'refresh-B')]);

  assert.deepEqual(refreshCalls.sort(), ['refresh-A', 'refresh-B']);
});

/* The flight is released, or one refresh would be the only one ever performed. */
test('a later expiry refreshes again rather than reusing a settled flight', async () => {
  await resolveAuth(undefined, 'refresh-1');
  await resolveAuth(undefined, 'refresh-1');

  assert.equal(refreshCalls.length, 2);
});

/** 9. A failed refresh does not loop. */
test('case 9: a failed refresh is terminal, not retried in a loop', async () => {
  refreshReply = { status: 401 };

  await resolveAuth(undefined, 'refresh-dead');

  assert.equal(refreshCalls.length, 1, 'a rejected refresh must be attempted once');
});

/*
 * ---------------------------------------------------------------------------
 * A network failure is not an authentication failure.
 *
 * These used to all resolve to `expired`, which signed a user out whenever the
 * API restarted — punishing them for an outage with credentials that were never
 * in question. The backend answers 401 for every genuine failure it has, so an
 * answer that is not 401 or 403 is about the server, not the session.
 * ---------------------------------------------------------------------------
 */

/** 11. Connection refused. */
test('case 11: a refused connection keeps the session', async () => {
  refreshReply = { throws: new Error('ECONNREFUSED') };

  const auth = await resolveAuth(undefined, 'refresh-1');

  assert.equal(auth.status, 'unavailable');
  assert.notEqual(auth.status, 'expired');
});

/** 12. The API is up but broken. */
for (const status of [500, 502, 503, 504]) {
  test(`case 12: a ${status} from the API keeps the session`, async () => {
    refreshReply = { status };

    assert.equal((await resolveAuth(undefined, 'refresh-1')).status, 'unavailable');
  });
}

/** 13. A timeout. */
test('case 13: a timeout keeps the session', async () => {
  refreshReply = { throws: Object.assign(new Error('timeout'), { name: 'TimeoutError' }) };

  assert.equal((await resolveAuth(undefined, 'refresh-1')).status, 'unavailable');
});

/** 14 & 15. The two answers that *are* about the session. */
test('case 14: a 401 from the refresh endpoint ends the session', async () => {
  refreshReply = { status: 401 };

  assert.equal((await resolveAuth(undefined, 'refresh-1')).status, 'expired');
});

test('case 15: a 403 from the refresh endpoint ends the session', async () => {
  refreshReply = { status: 403 };

  assert.equal((await resolveAuth(undefined, 'refresh-1')).status, 'expired');
});

/*
 * A 200 carrying no session is a broken response, not a refusal — an API host
 * serving an HTML error page during a deploy must not sign everybody out.
 */
test('a 200 with no tokens in it keeps the session', async () => {
  refreshReply = { body: { roles: [] } };

  assert.equal((await resolveAuth(undefined, 'refresh-1')).status, 'unavailable');
});

/* 8 again, from the other side: a replayed token is refused, and that is the one
   place a session legitimately ends mid-flight. */
test('case 8b: a replayed refresh token is refused, not retried', async () => {
  refreshReply = { status: 401 };

  const results = await Promise.all([
    resolveAuth(undefined, 'refresh-replayed'),
    resolveAuth(undefined, 'refresh-replayed'),
  ]);

  assert.equal(refreshCalls.length, 1, 'a replay must not be re-presented');
  for (const auth of results) assert.equal(auth.status, 'expired');
});

/*
 * The dead-zone the cookie lifetime used to create: present, well-formed, and
 * useless. Every guard that asked "is there a cookie" said yes.
 */
test('isAccessTokenUsable rejects a token that is present but dead', () => {
  assert.equal(isAccessTokenUsable(EXPIRED()), false);
  assert.equal(isAccessTokenUsable(VALID()), true);
});

test('isAccessTokenUsable treats absent and unreadable tokens as unusable', () => {
  assert.equal(isAccessTokenUsable(undefined), false);
  assert.equal(isAccessTokenUsable(''), false);
  assert.equal(isAccessTokenUsable('not-a-jwt'), false);
  assert.equal(isAccessTokenUsable('a.b.c'), false);
});

/* Refreshing a few seconds early costs one rotation; not doing it costs the user
   an error on a page they are entitled to. */
test('isAccessTokenUsable refuses a token about to expire mid-render', () => {
  assert.equal(isAccessTokenUsable(token(5)), false);
  assert.equal(isAccessTokenUsable(token(120)), true);
});

/* A token with no expiry is a backend choice, not this file's to override. */
test('isAccessTokenUsable accepts a token that carries no expiry', () => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  assert.equal(isAccessTokenUsable(`${encode({})}.${encode({ sub: 'u' })}.sig`), true);
});
