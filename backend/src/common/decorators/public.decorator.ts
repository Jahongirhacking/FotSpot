import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as accessible by Guest (unauthenticated) users. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
