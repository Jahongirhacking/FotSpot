// src/common/decorators/roles.decorator.ts
import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";

// Usage: @Roles('ADMIN', 'SUPER_ADMIN')
// Works together with RolesGuard to protect endpoints by role
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
