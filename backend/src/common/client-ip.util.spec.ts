import { resolveClientIp } from './client-ip.util';

/**
 * The address these functions return is what the login lockout and the request
 * throttle both count against. Read the wrong entry of `X-Forwarded-For` and
 * both become decorative: an attacker sends a different header every ten
 * attempts and never trips either. That is the bug these cover.
 */
describe('resolveClientIp', () => {
  const SOCKET = '10.0.0.9';

  it('ignores the header entirely when no proxy is trusted', () => {
    // The default deployment: this process is reachable directly, so the header
    // is pure client input and worth nothing.
    expect(resolveClientIp({ 'x-forwarded-for': '1.2.3.4' }, SOCKET, 0)).toBe(SOCKET);
  });

  it('reads from the right, so a client-supplied prefix cannot win', () => {
    // The client wrote "1.2.3.4"; the load balancer appended the address it
    // actually saw. With one trusted hop, that last entry is the answer.
    const forged = '1.2.3.4, 203.0.113.7';
    expect(resolveClientIp({ 'x-forwarded-for': forged }, SOCKET, 1)).toBe('203.0.113.7');
  });

  it('cannot be walked back by stuffing more entries in', () => {
    // Ten fabricated hops still do not reach past the one the proxy appended.
    const stuffed = `${Array.from({ length: 10 }, (_, i) => `9.9.9.${i}`).join(', ')}, 203.0.113.7`;
    expect(resolveClientIp({ 'x-forwarded-for': stuffed }, SOCKET, 1)).toBe('203.0.113.7');
  });

  it('counts two hops from the right behind a CDN and a balancer', () => {
    const chain = '1.2.3.4, 198.51.100.1, 203.0.113.7';
    expect(resolveClientIp({ 'x-forwarded-for': chain }, SOCKET, 2)).toBe('198.51.100.1');
  });

  it('falls back to the socket when the header is absent or empty', () => {
    expect(resolveClientIp({}, SOCKET, 1)).toBe(SOCKET);
    expect(resolveClientIp({ 'x-forwarded-for': '' }, SOCKET, 1)).toBe(SOCKET);
    expect(resolveClientIp(undefined, SOCKET, 1)).toBe(SOCKET);
  });

  it('handles a chain shorter than the configured hops without returning undefined', () => {
    // Misconfiguration, or a request that skipped a hop. Answering `undefined`
    // would exempt the caller from throttling entirely, which is the one outcome
    // that must not happen.
    expect(resolveClientIp({ 'x-forwarded-for': '203.0.113.7' }, SOCKET, 3)).toBe('203.0.113.7');
  });

  it('accepts the array form Node produces for a repeated header', () => {
    expect(resolveClientIp({ 'x-forwarded-for': ['1.2.3.4', '203.0.113.7'] }, SOCKET, 1)).toBe(
      '203.0.113.7',
    );
  });
});
