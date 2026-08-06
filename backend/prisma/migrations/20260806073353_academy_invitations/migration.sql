-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationEvent" ADD VALUE 'ACADEMY_JOIN_INVITATION';
ALTER TYPE "NotificationEvent" ADD VALUE 'ACADEMY_JOIN_ANSWER';

-- CreateTable
CREATE TABLE "AcademyInvitation" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AcademyMemberRole" NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "invitedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "AcademyInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademyInvitation_userId_status_idx" ON "AcademyInvitation"("userId", "status");

-- CreateIndex
CREATE INDEX "AcademyInvitation_academyId_status_idx" ON "AcademyInvitation"("academyId", "status");

-- AddForeignKey
ALTER TABLE "AcademyInvitation" ADD CONSTRAINT "AcademyInvitation_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "AcademyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyInvitation" ADD CONSTRAINT "AcademyInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
