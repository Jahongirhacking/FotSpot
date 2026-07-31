import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

/** Minimal stand-ins for the Express request/response the filter reaches for. */
function hostFor(request: Record<string, unknown> = {}) {
  const { headers = {}, ...rest } = request as { headers?: Record<string, string> };
  const json = jest.fn();
  const response = { status: jest.fn().mockReturnValue({ json }) };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'POST', originalUrl: '/api/v1/thing', headers, ...rest }),
    }),
  } as unknown as ArgumentsHost;
  return { host, json };
}

function spies() {
  return {
    error: jest.spyOn(Logger.prototype, 'error').mockImplementation(),
    warn: jest.spyOn(Logger.prototype, 'warn').mockImplementation(),
    debug: jest.spyOn(Logger.prototype, 'debug').mockImplementation(),
  };
}

describe('HttpExceptionFilter', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  describe('in development', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('logs an unexpected failure as an error, with its stack', () => {
      const log = spies();
      const { host } = hostFor();
      new HttpExceptionFilter().catch(new Error('database exploded'), host);

      expect(log.error).toHaveBeenCalledTimes(1);
      const [line, stack] = log.error.mock.calls[0];
      expect(line).toContain('500 POST /api/v1/thing');
      expect(String(stack)).toContain('database exploded');
    });

    it('warns on a 403 — someone authenticated was refused', () => {
      const log = spies();
      new HttpExceptionFilter().catch(new ForbiddenException('nope'), hostFor().host);

      expect(log.warn).toHaveBeenCalledTimes(1);
      expect(log.warn.mock.calls[0][0]).toContain('403');
      expect(log.error).not.toHaveBeenCalled();
    });

    it('warns on a 401 that presented a token — it did not hold up', () => {
      const log = spies();
      const { host } = hostFor({ headers: { authorization: 'Bearer stale' } });
      new HttpExceptionFilter().catch(new UnauthorizedException(), host);

      expect(log.warn).toHaveBeenCalledTimes(1);
      expect(log.warn.mock.calls[0][0]).toContain('token=presented');
    });

    it('stays quiet on a 401 with no token — the client is about to refresh', () => {
      // The access cookie outlives the 15-minute token, so the browser routinely
      // fires a request without one, 401s, refreshes and retries. Warning about a
      // self-healing cycle is how real warnings get ignored.
      const log = spies();
      new HttpExceptionFilter().catch(new UnauthorizedException(), hostFor().host);

      expect(log.warn).not.toHaveBeenCalled();
      expect(log.debug).toHaveBeenCalledTimes(1);
      expect(log.debug.mock.calls[0][0]).toContain('token=none');
    });

    it('logs ordinary 4xx at debug, so production never drowns in them', () => {
      const log = spies();
      new HttpExceptionFilter().catch(new NotFoundException('gone'), hostFor().host);

      expect(log.debug).toHaveBeenCalledTimes(1);
      expect(log.warn).not.toHaveBeenCalled();
      expect(log.error).not.toHaveBeenCalled();
    });

    it('names the caller and the role they were acting as', () => {
      const log = spies();
      const { host } = hostFor({ user: { userId: 'u-1', activeRole: 'academy_manager' } });
      new HttpExceptionFilter().catch(new ForbiddenException('nope'), host);

      expect(log.warn.mock.calls[0][0]).toContain('user=u-1');
      expect(log.warn.mock.calls[0][0]).toContain('as=academy_manager');
    });

    it('never logs the request body', () => {
      const log = spies();
      const { host } = hostFor({
        body: { password: 'hunter2', code: '123456', refreshToken: 'eyJ-secret' },
      });
      new HttpExceptionFilter().catch(new Error('boom'), host);

      const logged = JSON.stringify(log.error.mock.calls);
      expect(logged).not.toContain('hunter2');
      expect(logged).not.toContain('123456');
      expect(logged).not.toContain('eyJ-secret');
    });

    it('gives a 5xx an id the response can quote back', () => {
      spies();
      const { host, json } = hostFor();
      new HttpExceptionFilter().catch(new Error('boom'), host);

      expect(json.mock.calls[0][0].errorId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('does not issue an id for a 4xx — the client already knows what went wrong', () => {
      spies();
      const { host, json } = hostFor();
      new HttpExceptionFilter().catch(new BadRequestException('bad'), host);

      expect(json.mock.calls[0][0].errorId).toBeUndefined();
    });
  });

  describe('in production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('logs nothing at all — Sentry is the record there', () => {
      const log = spies();
      const { host } = hostFor();
      new HttpExceptionFilter().catch(new Error('boom'), host);
      new HttpExceptionFilter().catch(new ForbiddenException(), host);
      new HttpExceptionFilter().catch(new NotFoundException(), host);

      expect(log.error).not.toHaveBeenCalled();
      expect(log.warn).not.toHaveBeenCalled();
      expect(log.debug).not.toHaveBeenCalled();
    });

    it('withholds the error id, which would point at a log line that does not exist', () => {
      spies();
      const { host, json } = hostFor();
      new HttpExceptionFilter().catch(new Error('boom'), host);

      expect(json.mock.calls[0][0].errorId).toBeUndefined();
    });

    it('still answers with the documented shape', () => {
      spies();
      const { host, json } = hostFor();
      new HttpExceptionFilter().catch(new NotFoundException('gone'), host);

      const body = json.mock.calls[0][0];
      expect(body.statusCode).toBe(404);
      expect(body.timestamp).toEqual(expect.any(String));
      expect(body.error).toBeDefined();
    });
  });
});
