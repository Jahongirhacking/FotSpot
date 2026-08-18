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
  ACADEMY_MANAGER_CHANGED: 'academy.manager_changed',
  PLAYER_BIRTHDATE_CHANGED: 'player.birthdate_changed',
  ACADEMY_GROUP_CREATED: 'academy.group_created',
  ACADEMY_GROUP_DELETED: 'academy.group_deleted',
  ACADEMY_GROUP_MEMBERS_MOVED: 'academy.group_members_moved',
  ACADEMY_TRANSFER_REQUESTED: 'academy.transfer_requested',
  ACADEMY_TRANSFER_DECIDED: 'academy.transfer_decided',
  ACADEMY_COACH_ADDED: 'academy.coach_added',
  ACADEMY_INVITATION_SENT: 'academy.invitation_sent',
  ACADEMY_INVITATION_ANSWERED: 'academy.invitation_answered',
  ACADEMY_MEMBER_UPDATED: 'academy.member_updated',
  ACADEMY_MEMBER_RELEASED: 'academy.member_released',
  ACADEMY_MEMBER_IMPORTED: 'academy.member_imported',
  MANAGER_PASSWORD_RESET: 'academy.manager_password_reset',
  SUPPORT_REQUEST_CREATED: 'support.request_created',
  SUPPORT_REQUEST_HANDLED: 'support.request_handled',
  USER_DELETED: 'admin.user_deleted',
  ADMIN_ASSIGNED: 'admin.assigned',
  ADMIN_REVOKED: 'admin.revoked',
  ROLE_ASSIGNED: 'role.assigned',
  ROLE_REMOVED: 'role.removed',
  PERMISSION_CREATED: 'permission.created',
  ROLE_PERMISSION_GRANTED: 'role_permission.granted',
  ENDORSEMENT_GRANTED: 'endorsement.granted',
  ENDORSEMENT_REVOKED: 'endorsement.revoked',
  USER_ENABLED: 'user.enabled',
  USER_DISABLED: 'user.disabled',
  USER_PLAN_CHANGED: 'user.plan_changed',
  TARIFF_PLAN_UPDATED: 'tariff_plan.updated',
  REPORT_RESOLVED: 'report.resolved',
  MEDIA_TAKEN_DOWN: 'media.taken_down',
  /**
   * The three video-moderation decisions (§1.7 review).
   *
   * Separate keys rather than one `media.moderated` with the outcome in `meta`,
   * because the trail is read by filtering on `action` — "show me everything a
   * super admin has destroyed" has to be a match, not a scan with a JSON test.
   * The meta on each carries `previousStatus`/`newStatus`, so a row is a complete
   * transition record on its own.
   */
  MEDIA_VERIFIED: 'media.verified',
  MEDIA_BLOCKED: 'media.blocked',
  MEDIA_DELETED: 'media.deleted',
} as const;

export type AuditActionKey = (typeof AuditAction)[keyof typeof AuditAction];
