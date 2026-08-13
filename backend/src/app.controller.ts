import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { NoThrottle } from './common/decorators/throttle.decorator';

@ApiTags('health')
@Controller()
export class AppController {
  /**
   * Liveness probe, at `/health` — outside the `/api/v1` prefix on purpose.
   *
   * A load balancer, uptime monitor or container orchestrator is not a client of
   * the versioned API and should not have to track its version to find out
   * whether the process is up. `main.ts` excludes this one path from the prefix
   * for that reason.
   *
   * `@Public()` because a probe carries no token, and `@NoThrottle()` because a
   * health check is precisely the caller that polls on a fixed schedule — two
   * monitors at one request a second would otherwise trip the default 120/minute
   * and take the service out of rotation for being *watched*, which is the
   * failure this endpoint exists to prevent.
   *
   * Deliberately shallow: it answers "is this process serving HTTP", not "is
   * Postgres reachable". A liveness probe that fails when a dependency is down
   * gets the container killed and restarted, which fixes nothing and removes the
   * instance that could still serve cached reads. A readiness check that touches
   * the database is a separate endpoint and a separate decision.
   */
  @Public()
  @NoThrottle()
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('debug-sentry')
  getError() {
    throw new Error('My first Sentry error!');
  }
}
