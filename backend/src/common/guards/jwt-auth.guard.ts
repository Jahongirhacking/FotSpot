import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isPublic) return (await super.canActivate(context)) as boolean;

    // Public route: still attempt authentication so that a signed-in caller is
    // identified (@OptionalUser), but never reject. A missing or invalid token
    // is a normal condition here - guests are first-class on public reads (1.2).
    // @Public() therefore still means "never 401", exactly as before; it just no
    // longer discards a perfectly good token.
    try {
      await super.canActivate(context);
    } catch {
      // Intentionally ignored - see above.
    }
    return true;
  }
}
