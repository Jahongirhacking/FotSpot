-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Clips uploaded before a recording date existed: the upload is the only date
-- they have, so it becomes their recording date rather than the migration's.
UPDATE "Media" SET "recordedAt" = "createdAt";
