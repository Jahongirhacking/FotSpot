-- AlterTable
ALTER TABLE "TrialResult" ADD COLUMN     "settledAt" TIMESTAMP(3);

-- Every verdict recorded before this column existed was acted on the moment it
-- was written, so none of them is still undoable or still owed its consequences.
UPDATE "TrialResult" SET "settledAt" = "decidedAt" WHERE "settledAt" IS NULL;
