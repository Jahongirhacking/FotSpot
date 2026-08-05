-- Named squads inside an academy. There is no "Reserve" row: reserve is the
-- absence of a group, so everyone who joins is in it by construction.
CREATE TABLE "AcademyGroup" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AcademyGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademyGroup_academyId_name_key" ON "AcademyGroup"("academyId", "name");
CREATE INDEX "AcademyGroup_academyId_idx" ON "AcademyGroup"("academyId");

ALTER TABLE "AcademyGroup" ADD CONSTRAINT "AcademyGroup_academyId_fkey"
    FOREIGN KEY ("academyId") REFERENCES "AcademyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Null means the academy's reserve.
ALTER TABLE "AcademyMember" ADD COLUMN "groupId" TEXT;
ALTER TABLE "AcademyMember" ADD CONSTRAINT "AcademyMember_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "AcademyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One academy offers, the other answers. A transfer that took effect on one
-- manager's press would let anybody put a player on a rival's books.
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "MemberTransfer" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "fromAcademyId" TEXT NOT NULL,
    "toAcademyId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "MemberTransfer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemberTransfer_toAcademyId_status_idx" ON "MemberTransfer"("toAcademyId", "status");
CREATE INDEX "MemberTransfer_fromAcademyId_status_idx" ON "MemberTransfer"("fromAcademyId", "status");

ALTER TABLE "MemberTransfer" ADD CONSTRAINT "MemberTransfer_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "AcademyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberTransfer" ADD CONSTRAINT "MemberTransfer_fromAcademyId_fkey"
    FOREIGN KEY ("fromAcademyId") REFERENCES "AcademyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberTransfer" ADD CONSTRAINT "MemberTransfer_toAcademyId_fkey"
    FOREIGN KEY ("toAcademyId") REFERENCES "AcademyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
