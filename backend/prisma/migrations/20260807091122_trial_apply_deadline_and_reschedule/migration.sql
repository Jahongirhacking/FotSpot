-- Closes applications before the exam, and tells applicants when it moves.
--
-- `applyDeadline` is nullable so trials written before it existed keep behaving
-- as they did — open until their exam date. Every new trial carries one.
--
-- TRIAL_RESCHEDULED goes to everybody already holding an application when the
-- exam date changes: it is the one detail a family has arranged their week
-- around, and moving it silently wastes somebody's morning.

-- AlterEnum
ALTER TYPE "NotificationEvent" ADD VALUE 'TRIAL_RESCHEDULED';

-- AlterTable
ALTER TABLE "Trial" ADD COLUMN     "applyDeadline" TIMESTAMP(3);
