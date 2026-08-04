-- Accounts can hide themselves from public listings and profiles.
ALTER TABLE "User" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- Players are academy members too, so an academy has a roster it can manage.
ALTER TYPE "AcademyMemberRole" ADD VALUE 'PLAYER';

-- A membership is never deleted, only moved through a lifecycle: INACTIVE keeps
-- a departed coach's assessments meaningful, RELEASED offers them for transfer.
CREATE TYPE "AcademyMemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'RELEASED');

ALTER TABLE "AcademyMember"
  ADD COLUMN "status" "AcademyMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "releasedAt" TIMESTAMP(3),
  ADD COLUMN "previousAcademyId" TEXT,
  ADD COLUMN "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
