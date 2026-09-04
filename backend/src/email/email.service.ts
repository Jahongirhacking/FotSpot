import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * How long to wait on Resend before giving up.
 *
 * Registration blocks on this call, so an unbounded wait is a signup form that
 * hangs. Five seconds is far above Resend's normal few hundred milliseconds and
 * far below a user's patience.
 */
const SEND_TIMEOUT_MS = 5000;

export type EmailPurpose = 'registration' | 'password-reset' | 'contact-change';

/**
 * Transactional email, through Resend.
 *
 * ## One service, three callers
 *
 * Registration codes, password-reset codes and contact-change codes all used to
 * generate a code, store its hash and then send nothing. Three call sites, so the
 * provider lives behind one method rather than being pasted into each — and the
 * fourth caller, whenever it arrives, gets the retries, the timeout and the
 * redaction for free instead of reimplementing two of the three.
 *
 * ## No SDK
 *
 * Resend's send API is one POST with a JSON body. The `resend` package would add
 * a dependency to wrap `fetch`, and this file is short enough to read in full —
 * which matters for something that handles one-time codes.
 *
 * ## Unconfigured is a supported state, not a crash
 *
 * Without `RESEND_API_KEY` this reports `sent: false` and the caller behaves
 * exactly as it did before the integration existed: the code is still generated
 * and stored, and in development it is still echoed back so the flow is testable.
 * That keeps local development and CI working without credentials.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private config: ConfigService) {}

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private get apiKey(): string {
    return (this.config.get<string>('RESEND_API_KEY') ?? '').trim();
  }

  /**
   * The verified sender.
   *
   * Must be on a domain verified in Resend — `email.fotspot.uz` — or Resend
   * refuses the send outright. A subdomain is the right choice: its DKIM and SPF
   * records are separate from the ones the team's own mail uses, so a
   * transactional volume spike cannot damage the reputation of the address a
   * person replies to.
   */
  private get from(): string {
    return (
      (this.config.get<string>('EMAIL_FROM') ?? '').trim() || 'FotSpot <noreply@email.fotspot.uz>'
    );
  }

  /**
   * The FotSpot logo, as an address a mail client can fetch.
   *
   * Served from the web app's `public/` directory at `APP_PUBLIC_URL` — the same
   * origin every SMS and Telegram link is built on, so there is one place the
   * site's address lives. Null when that is unset (local development), and then
   * the email simply carries no picture: an `<img>` pointed at localhost would
   * render as a broken box in every inbox it reached.
   */
  private get logoUrl(): string | null {
    const base = (this.config.get<string>('APP_PUBLIC_URL') ?? '').trim().replace(/\/+$/, '');
    return base ? `${base}/fotspot.png` : null;
  }

  /**
   * Sends a one-time code.
   *
   * Returns whether it went, rather than throwing: the caller decides what an
   * undelivered code means. Registration should refuse — telling somebody a code
   * is on its way when it is not leaves them waiting for ever — whereas the
   * password-reset path answers identically either way on purpose, and must not
   * start failing differently just because mail is down.
   */
  async sendCode(to: string, code: string, purpose: EmailPurpose): Promise<{ sent: boolean }> {
    if (!this.isConfigured) {
      this.logger.warn(
        `RESEND_API_KEY is not set — a ${purpose} code was generated for ${maskEmail(to)} but not sent.`,
      );
      return { sent: false };
    }

    const { subject, heading, body } = copyFor(purpose);

    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [to],
          subject,
          html: html(heading, body, code, this.logoUrl),
          // A plain-text part is not decoration: some clients show it instead,
          // and a code nobody can read is the same as a code nobody received.
          text: `${heading}\n\n${code}\n\n${body}`,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        // Resend's body says which field it disliked — an unverified domain and a
        // bad key look identical without it. The code itself is never in there.
        const detail = await response.text().catch(() => '');
        this.logger.error(
          `Resend refused a ${purpose} email to ${maskEmail(to)}: ${response.status} ${detail.slice(0, 300)}`,
        );
        return { sent: false };
      }

      this.logger.log(`[EMAIL] ${purpose} code sent to ${maskEmail(to)}`);
      return { sent: true };
    } catch (error) {
      this.logger.error(
        `Could not reach Resend for a ${purpose} email to ${maskEmail(to)}: ${(error as Error).message}`,
      );
      return { sent: false };
    }
  }
}

/**
 * `j****r@gmail.com` — enough to recognise your own address in a log, not enough
 * to harvest somebody else's from one. The code is never logged at all.
 */
export function maskEmail(address: string): string {
  const [local, domain] = address.split('@');
  if (!domain) return '***';
  const head = local.slice(0, 1);
  const tail = local.length > 1 ? local.slice(-1) : '';
  return `${head}${'*'.repeat(Math.max(1, local.length - 2))}${tail}@${domain}`;
}

/**
 * Uzbek first, English underneath.
 *
 * The product's default language is Uzbek and most recipients read it, but the
 * backend has no locale for the person it is emailing — registration happens
 * before an account exists, so there is nothing to look one up on. Two short
 * lines beats plumbing a locale through three call sites to pick between them.
 */
function copyFor(purpose: EmailPurpose): { subject: string; heading: string; body: string } {
  switch (purpose) {
    case 'registration':
      return {
        subject: 'FotSpot — tasdiqlash kodi / verification code',
        heading: 'Tasdiqlash kodingiz / Your verification code',
        body: 'Kod 15 daqiqada eskiradi. Agar bu siz bo‘lmasangiz, bu xatni e’tiborsiz qoldiring. — This code expires in 15 minutes. If this wasn’t you, ignore this email.',
      };
    case 'password-reset':
      return {
        subject: 'FotSpot — parolni tiklash / password reset',
        heading: 'Parolni tiklash kodi / Password reset code',
        body: 'Kod 15 daqiqada eskiradi. Agar parolni tiklashni so‘ramagan bo‘lsangiz, hech narsa qilish shart emas. — This code expires in 15 minutes. If you didn’t ask to reset your password, no action is needed.',
      };
    case 'contact-change':
      return {
        subject: 'FotSpot — yangi manzilni tasdiqlang / confirm your new address',
        heading: 'Yangi manzilni tasdiqlash / Confirm your new address',
        body: 'Kod 10 daqiqada eskiradi. — This code expires in 10 minutes.',
      };
  }
}

/**
 * Inline styles and a table-free layout, because that is what mail clients
 * actually render. No external CSS, and nothing legible depends on an image: a
 * code that needs a network fetch to be read is a code half the recipients
 * cannot read. The logo is the one picture, and it is decoration — its alt text
 * is the brand name, and the line under it says the same thing in type — so a
 * client that blocks remote images loses a logo, not the code.
 */
function html(heading: string, body: string, code: string, logoUrl: string | null): string {
  const logo = logoUrl
    ? `<img src="${logoUrl}" alt="FotSpot" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:12px;margin:0 0 12px" />\n    `
    : '';
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f6f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    ${logo}<p style="margin:0 0 4px;font-size:18px;font-weight:700">FotSpot</p>
    <p style="margin:0 0 20px;font-size:15px">${heading}</p>
    <p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:6px;text-align:center;padding:14px;background:#f0fdf4;border-radius:10px">${code}</p>
    <p style="margin:0;font-size:13px;color:#555;line-height:1.5">${body}</p>
  </div>
</body></html>`;
}
