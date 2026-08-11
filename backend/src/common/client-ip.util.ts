/**
 * Who the request actually came from.
 *
 * ## The header is evidence only as far as something guarantees it
 *
 * `X-Forwarded-For` is written by whatever is in front of this process, and
 * appended to by each hop — but the *client* may send one too, and the first
 * entries of the chain are therefore whatever the caller felt like typing. Only
 * the entries a trusted hop added are worth anything.
 *
 * Reading `chain[0]`, which is the obvious thing to do and what this codebase
 * used to do, reads exactly the part the client controls. That made the login
 * lockout decorative: ten wrong passwords, change the header, ten more, for
 * ever. The throttle would have had the same hole.
 *
 * ## TRUST_PROXY_HOPS
 *
 * The number of proxies genuinely in front of this process — 1 behind a single
 * load balancer, 2 behind a CDN and a balancer. The entry that many places from
 * the **right** is the last address a trusted hop wrote and the first one the
 * client could not forge.
 *
 * The default of 0 ignores the header entirely, which is correct for a directly
 * reachable process and is the safe way to be wrong: an under-trusted deployment
 * lumps callers together behind the proxy's address and throttles too eagerly,
 * while an over-trusted one lets every caller invent an identity per request.
 *
 * Pure and DI-free (backend/CLAUDE.md §2) so both the guard and the decorator
 * can share one answer, and so the parsing is unit-testable without a request.
 */
/**
 * Just the one header, structurally — so this stays callable with Express's
 * `IncomingHttpHeaders` and with a plain object in a test, without either side
 * importing the other's types.
 */
export interface IpHeaders {
  'x-forwarded-for'?: string | string[] | undefined;
  [header: string]: unknown;
}

export function resolveClientIp(
  headers: IpHeaders | undefined,
  socketAddress: string | undefined,
  trustedHops = Number(process.env.TRUST_PROXY_HOPS ?? 0),
): string | undefined {
  if (trustedHops > 0 && headers) {
    const raw = headers['x-forwarded-for'];
    const chain = (Array.isArray(raw) ? raw.join(',') : (raw ?? ''))
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    // Counting from the right. If the chain is shorter than the configured hop
    // count something upstream is not appending as expected, and the leftmost
    // entry is the closest thing to a trusted one available.
    const candidate = chain[chain.length - trustedHops] ?? chain[0];
    if (candidate) return candidate;
  }

  return socketAddress;
}
