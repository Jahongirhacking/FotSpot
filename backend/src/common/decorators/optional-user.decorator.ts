import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from './current-user.decorator';

/**
 * The caller's user id when a valid token was supplied, otherwise `undefined`.
 *
 * For @Public() routes that behave differently for a signed-in user but must
 * still serve guests - e.g. attributing a media view (1.14) without locking
 * guests out of viewing (1.2). On a guarded route use @CurrentUser instead,
 * which is always populated.
 */
export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    return user?.userId;
  },
);
