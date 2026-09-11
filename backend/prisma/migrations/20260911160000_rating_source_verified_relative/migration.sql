-- Players no longer rate their own clips. A coach's rating is VERIFIED; a
-- moderator's is RELATIVE. Every SELF rating still on a clip becomes RELATIVE
-- (it weighs the same half on the card that a self rating did), COACH becomes
-- VERIFIED, and the moderator's ADMIN becomes RELATIVE. The enum is rebuilt
-- rather than added to, so the old values cannot come back.

-- AlterEnum
CREATE TYPE "RatingSource_new" AS ENUM ('VERIFIED', 'RELATIVE');

ALTER TABLE "Media" ALTER COLUMN "reportedBy" DROP DEFAULT;
ALTER TABLE "Media" ALTER COLUMN "reportedBy" TYPE "RatingSource_new"
  USING (CASE "reportedBy"::text WHEN 'COACH' THEN 'VERIFIED' ELSE 'RELATIVE' END)::"RatingSource_new";
ALTER TABLE "RatingRevision" ALTER COLUMN "previousReportedBy" TYPE "RatingSource_new"
  USING (CASE "previousReportedBy"::text WHEN 'COACH' THEN 'VERIFIED' ELSE 'RELATIVE' END)::"RatingSource_new";
ALTER TABLE "RatingRevision" ALTER COLUMN "reportedBy" TYPE "RatingSource_new"
  USING (CASE "reportedBy"::text WHEN 'COACH' THEN 'VERIFIED' ELSE 'RELATIVE' END)::"RatingSource_new";

DROP TYPE "RatingSource";
ALTER TYPE "RatingSource_new" RENAME TO "RatingSource";

ALTER TABLE "Media" ALTER COLUMN "reportedBy" SET DEFAULT 'RELATIVE';
