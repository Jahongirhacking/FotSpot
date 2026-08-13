import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

/** Google's published signing keys, in JWK form. */
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/** The only two issuers Google mints ID tokens under. */
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/**
 * Keys are rotated on the order of days, so an hour is frequent enough to pick a
 * new one up long before the old one stops signing, and rare enough that a login
 * is not gated on a call to Google. A `kid` that is not in the cache forces a
 * refresh regardless, which is what actually handles rotation — this is only the
 * floor on how often that can happen.
 */
const JWKS_TTL_MS = 60 * 60 * 1000;

interface GoogleJwk {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

export interface GoogleIdentity {
  googleSub: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
}

/**
 * Turns a Google ID token into an identity, or refuses.
 *
 * ## Why the signature is checked here and not taken on trust
 *
 * The token arrives from the browser, which means it arrives from whoever is
 * driving the browser. Reading its claims without verifying the signature is the
 * same as letting a caller name the account they would like to be — which is
 * exactly what the old `/auth/oauth` stub did, and why it is gone.
 *
 * So: the token is a JWT signed by Google with RS256. Its `kid` selects a key
 * from Google's published set, the signature is checked against that key, and the
 * claims are only read afterwards. `aud` must be this application's own client
 * id, or a token minted for a different site — trivially obtained by anybody
 * running one — would be accepted here.
 *
 * Verified with the JWKS directly rather than by adding `google-auth-library`:
 * Node can build a public key from a JWK unaided, so the dependency would buy a
 * cache and an opinion, and this file needs to be readable by whoever audits the
 * login path.
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private keys = new Map<string, crypto.KeyObject>();
  private fetchedAt = 0;
  private inFlight: Promise<void> | null = null;

  constructor(
    private config: ConfigService,
    private jwt: JwtService,
  ) {}

  /** Lets the login endpoint answer "not configured" instead of "no". */
  get isConfigured(): boolean {
    return Boolean(this.clientId);
  }

  private get clientId(): string {
    return (this.config.get<string>('GOOGLE_CLIENT_ID') ?? '').trim();
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Google sign-in is not configured on this server (GOOGLE_CLIENT_ID is unset).',
      );
    }

    const kid = this.kidOf(idToken);
    const key = await this.keyFor(kid);

    let claims: Record<string, unknown>;
    try {
      claims = await this.jwt.verifyAsync(idToken, {
        publicKey: key.export({ type: 'spki', format: 'pem' }) as string,
        algorithms: ['RS256'],
        // `audience` and `issuer` are checked by the library rather than by hand
        // below, so a token for another site is rejected by the same pass that
        // checks the signature and cannot be forgotten separately.
        audience: this.clientId,
        issuer: ISSUERS,
      });
    } catch (error) {
      // Deliberately uninformative to the caller: which check failed is useful
      // to an attacker probing for one that is missing, and useless to a user.
      this.logger.warn(`Rejected a Google ID token: ${(error as Error).message}`);
      throw new UnauthorizedException('That Google sign-in could not be verified');
    }

    const email = typeof claims?.email === 'string' ? claims.email.toLowerCase() : '';
    if (!email) throw new UnauthorizedException('That Google account has no email address');

    /*
     * An unverified email is not an identity.
     *
     * Google will mint a token carrying an address the holder has never proved
     * they own. Matching an existing FotSpot account on one would hand that
     * account to whoever asked, so this is the difference between "sign in with
     * Google" and "sign in as anybody with a Google account".
     */
    if (claims?.email_verified !== true) {
      throw new UnauthorizedException('Verify your email address with Google first');
    }

    return {
      googleSub: String(claims?.sub ?? ''),
      email,
      emailVerified: true,
      firstName: typeof claims?.given_name === 'string' ? claims.given_name : undefined,
      lastName: typeof claims?.family_name === 'string' ? claims.family_name : undefined,
    };
  }

  /** The `kid` from the header, read without trusting anything else in the token. */
  private kidOf(idToken: string): string {
    const [rawHeader] = idToken.split('.');
    if (!rawHeader) throw new UnauthorizedException('That Google sign-in could not be verified');
    try {
      const header = JSON.parse(Buffer.from(rawHeader, 'base64url').toString('utf8'));
      if (typeof header?.kid !== 'string') throw new Error('no kid');
      return header.kid;
    } catch {
      throw new UnauthorizedException('That Google sign-in could not be verified');
    }
  }

  /**
   * The signing key for a `kid`, refreshing the set when it is unknown.
   *
   * An unknown `kid` is the normal shape of key rotation, not an error — so it
   * forces one refresh and is only rejected if the key is still missing
   * afterwards. The `inFlight` guard means a burst of logins during a rotation
   * makes one request to Google rather than one per login.
   */
  private async keyFor(kid: string): Promise<crypto.KeyObject> {
    const stale = Date.now() - this.fetchedAt > JWKS_TTL_MS;
    if (stale || !this.keys.has(kid)) await this.refreshKeys();

    const key = this.keys.get(kid);
    if (!key) throw new UnauthorizedException('That Google sign-in could not be verified');
    return key;
  }

  private async refreshKeys(): Promise<void> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = (async () => {
      const response = await fetch(JWKS_URL).catch((error: Error) => {
        throw new ServiceUnavailableException(
          `Could not reach Google to verify the sign-in: ${error.message}`,
        );
      });
      if (!response.ok) {
        throw new ServiceUnavailableException(
          `Google returned ${response.status} for its signing keys.`,
        );
      }

      const body = (await response.json()) as { keys?: GoogleJwk[] };
      const next = new Map<string, crypto.KeyObject>();
      for (const jwk of body?.keys ?? []) {
        if (jwk?.kty !== 'RSA' || !jwk?.kid) continue;
        try {
          next.set(
            jwk.kid,
            crypto.createPublicKey({ key: jwk as unknown as crypto.JsonWebKey, format: 'jwk' }),
          );
        } catch (error) {
          // One unusable key must not cost the whole set — the others still
          // verify tokens, and this is Google's data, not ours to reject wholesale.
          this.logger.warn(`Skipped a Google signing key (${jwk.kid}): ${(error as Error).message}`);
        }
      }

      if (next.size === 0) {
        throw new ServiceUnavailableException('Google published no usable signing keys.');
      }

      this.keys = next;
      this.fetchedAt = Date.now();
    })().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }
}
