-- The squad-placement notice was the second of two messages one act sent the
-- player; the join invitation (with its accept link) is the one that stays.
DELETE FROM "Notification" WHERE "event" = 'SQUAD_PLACEMENT';

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationEvent_new" AS ENUM ('ACADEMY_INVITATION', 'ACADEMY_JOIN_INVITATION', 'ACADEMY_JOIN_ANSWER', 'RECOMMENDATION_ACCEPTED', 'RECOMMENDATION_REJECTED', 'TRIAL_INVITATION', 'TRIAL_PUBLISHED', 'TRIAL_RESCHEDULED', 'TRIAL_RESULT', 'SQUAD_JOINED', 'SQUAD_LEFT', 'VERIFICATION_RESULT');
ALTER TABLE "Notification" ALTER COLUMN "event" TYPE "NotificationEvent_new" USING ("event"::text::"NotificationEvent_new");
ALTER TYPE "NotificationEvent" RENAME TO "NotificationEvent_old";
ALTER TYPE "NotificationEvent_new" RENAME TO "NotificationEvent";
DROP TYPE "public"."NotificationEvent_old";
COMMIT;

-- AlterTable
ALTER TABLE "AcademyInvitation" ADD COLUMN     "answerNote" TEXT,
ADD COLUMN     "settledAt" TIMESTAMP(3);


-- Every acceptance recorded before this column existed was acted on the moment
-- it was written, so none of them is still undoable or still owed its membership.
UPDATE "AcademyInvitation" SET "settledAt" = "decidedAt" WHERE "status" = 'ACCEPTED' AND "settledAt" IS NULL;
