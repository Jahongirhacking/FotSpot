import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SentryExceptionCaptured } from '@sentry/nestjs';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { AuthUser } from '../decorators/current-user.decorator';

/**
 * Turns every thrown exception into one JSON shape — and, now, into a log line.
 *
 * ## Why it logs here and nowhere else
 *
 * Every error in the app arrives here: guards, pipes, services, and anything
 * thrown by accident. That makes this the one place where "did something fail?"
 * can be answered completely. Logging inside individual services instead would
 * mean every new service is a fresh chance to forget — and the failures nobody
 * predicted, the ones that matter most, belong to no service at all.
 *
 * Until now this filter returned a 500 and said nothing at all, so a failure in
 * development left the terminal blank and the only way to find out what broke was
 * to add a `console.log` and reproduce it.
 *
 * ## Development only
 *
 * These lines are for the person with the terminal open. **In production nothing
 * is logged from here** — `instrument.ts` wires Sentry, `@SentryExceptionCaptured`
 * below reports every exception to it, and that is the production record. Writing
 * the same stack traces to stdout as well would duplicate what Sentry already
 * has, into a place with no retention, no grouping and no alerting, while
 * spilling internals into container logs and anything that ships them onward.
 *
 * The trade-off, stated plainly: if Sentry is ever unreachable or switched off,
 * production loses its error trail entirely. Flip `shouldLog` to always-on (or
 * gate it on a `LOG_ERRORS` env var) if that ever stops being an acceptable risk.
 *
 * ## Severity follows the status, because noise is the enemy of logs
 *
 * - **5xx** — `error`, with the stack. Our fault, and unhandled by definition.
 * - **401 / 403** — `warn`. Not bugs, but a run of them is someone probing, and
 *   that is exactly the signal an access-control change needs to be watchable.
 * - **other 4xx** — `debug`. A validation failure or a 404 is the API working;
 *   logging those at `warn` would teach everyone to ignore warnings.
 *
 * ## What is never logged
 *
 * The request body. It carries passwords, OTP codes, refresh tokens, verification
 * codes and generated academy-manager credentials, and a log file is exactly the
 * kind of place those leak from. Method, path, status and user id identify a
 * request perfectly well without any of it.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  /** Read once at construction — this runs on every failed request. */
  private readonly shouldLog = process.env.NODE_ENV !== 'production';

  @SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    // Only for 5xx, and only when there is a log line for it to point at.
    // Quoting this id in a bug report is what connects a user's "it broke" to
    // the stack trace that explains it — so it is not issued in production,
    // where no such line exists and the id would be a dead end.
    const errorId = this.shouldLog && status >= 500 ? crypto.randomUUID() : undefined;

    if (this.shouldLog) this.log(status, request, exception, errorId);

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      error: message,
      ...(errorId ? { errorId } : {}),
    });
  }

  private log(status: number, request: Request, exception: unknown, errorId?: string) {
    const user = request.user as AuthUser | undefined;
    const where = `${request.method} ${request.originalUrl}`;
    // `activeRole` is what authorization actually used (§1.2.1), so a 403 reads
    // correctly without cross-referencing which hat the user had on.
    const who = user
      ? `user=${user.userId}${user.activeRole ? ` as=${user.activeRole}` : ''}`
      : 'anonymous';

    if (status >= 500) {
      const detail = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${status} ${where} ${who} errorId=${errorId}`, detail);
      return;
    }

    const reason = this.reason(exception);
    if (status === 401 || status === 403) {
      this.logger.warn(`${status} ${where} ${who} — ${reason}`);
      return;
    }

    this.logger.debug(`${status} ${where} ${who} — ${reason}`);
  }

  /** The human-readable half of an HttpException body, however it was thrown. */
  private reason(exception: unknown): string {
    if (!(exception instanceof HttpException)) return String(exception);

    const body = exception.getResponse();
    if (typeof body === 'string') return body;

    const message = (body as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join('; ');
    return message ?? exception.message;
  }
}
