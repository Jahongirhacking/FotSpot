import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
/** Attach to a controller/handler to restrict access to given role names. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
