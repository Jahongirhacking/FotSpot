/**
 * Audit action keys - README 1.21.
 *
 * Centralised so that querying the audit trail ("show me every role grant") is a
 * literal match rather than a guess at how some service happened to spell it.
 * Format: `<subject>.<past-tense verb>`.
 */
export const AuditAction = {
  COACH_VERIFIED: 'coach.verified',
  ACADEMY_VERIFIED: 'academy.verified',
  ADMIN_ASSIGNED: 'admin.assigned',
  ADMIN_REVOKED: 'admin.revoked',
  ROLE_ASSIGNED: 'role.assigned',
  ROLE_REMOVED: 'role.removed',
  PERMISSION_CREATED: 'permission.created',
  ROLE_PERMISSION_GRANTED: 'role_permission.granted',
  ENDORSEMENT_GRANTED: 'endorsement.granted',
  ENDORSEMENT_REVOKED: 'endorsement.revoked',
  REPORT_RESOLVED: 'report.resolved',
  MEDIA_TAKEN_DOWN: 'media.taken_down',
} as const;

export type AuditActionKey = (typeof AuditAction)[keyof typeof AuditAction];
