-- CreateEnum
CREATE TYPE "AcademyKind" AS ENUM ('ACADEMY', 'LOCAL_TEAM');

-- AlterTable
ALTER TABLE "AcademyProfile" ADD COLUMN     "kind" "AcademyKind" NOT NULL DEFAULT 'ACADEMY';

-- CreateIndex
CREATE INDEX "AcademyProfile_kind_status_idx" ON "AcademyProfile"("kind", "status");
