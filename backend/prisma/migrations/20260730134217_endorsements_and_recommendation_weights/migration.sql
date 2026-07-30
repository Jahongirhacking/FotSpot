-- CreateEnum
CREATE TYPE "EndorsementRole" AS ENUM ('SCOUT', 'COACH');

-- CreateEnum
CREATE TYPE "EndorsementStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('GLOBAL', 'SPECIFIC');

-- DropForeignKey
ALTER TABLE "Recommendation" DROP CONSTRAINT "Recommendation_academyId_fkey";

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "scoutWeight" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "type" "RecommendationType" NOT NULL DEFAULT 'SPECIFIC',
ALTER COLUMN "academyId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AcademyEndorsement" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "EndorsementRole" NOT NULL,
    "status" "EndorsementStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyEndorsement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerRecommendationWeight" (
    "playerId" TEXT NOT NULL,
    "globalWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recommendationCount" INTEGER NOT NULL DEFAULT 0,
    "lastRecommendedAt" TIMESTAMP(3),
    "lastDecayedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRecommendationWeight_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "PlayerAcademyRecommendationWeight" (
    "playerId" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "extraWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recommendationCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerAcademyRecommendationWeight_pkey" PRIMARY KEY ("playerId","academyId")
);

-- CreateTable
CREATE TABLE "RecommendationTarget" (
    "recommendationId" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationTarget_pkey" PRIMARY KEY ("recommendationId","academyId")
);

-- CreateIndex
CREATE INDEX "AcademyEndorsement_userId_status_idx" ON "AcademyEndorsement"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyEndorsement_academyId_userId_role_key" ON "AcademyEndorsement"("academyId", "userId", "role");

-- CreateIndex
CREATE INDEX "PlayerRecommendationWeight_globalWeight_idx" ON "PlayerRecommendationWeight"("globalWeight");

-- CreateIndex
CREATE INDEX "PlayerAcademyRecommendationWeight_academyId_extraWeight_idx" ON "PlayerAcademyRecommendationWeight"("academyId", "extraWeight");

-- CreateIndex
CREATE INDEX "RecommendationTarget_academyId_status_idx" ON "RecommendationTarget"("academyId", "status");

-- CreateIndex
CREATE INDEX "Recommendation_playerId_idx" ON "Recommendation"("playerId");

-- CreateIndex
CREATE INDEX "Recommendation_scoutId_idx" ON "Recommendation"("scoutId");

-- AddForeignKey
ALTER TABLE "AcademyEndorsement" ADD CONSTRAINT "AcademyEndorsement_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "AcademyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyEndorsement" ADD CONSTRAINT "AcademyEndorsement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRecommendationWeight" ADD CONSTRAINT "PlayerRecommendationWeight_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAcademyRecommendationWeight" ADD CONSTRAINT "PlayerAcademyRecommendationWeight_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAcademyRecommendationWeight" ADD CONSTRAINT "PlayerAcademyRecommendationWeight_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "AcademyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "AcademyProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationTarget" ADD CONSTRAINT "RecommendationTarget_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationTarget" ADD CONSTRAINT "RecommendationTarget_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "AcademyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data backfill. Existing recommendations predate `RecommendationTarget`, and the
-- read paths now go through it. Without this they would silently vanish from
-- every academy inbox.
-- ---------------------------------------------------------------------------

-- 1. Every existing recommendation was addressed to exactly one academy, so it is
--    a SPECIFIC recommendation with a single target carrying its current status.
INSERT INTO "RecommendationTarget" ("recommendationId", "academyId", "status", "createdAt", "updatedAt")
SELECT r."id", r."academyId", r."status", r."createdAt", r."updatedAt"
FROM "Recommendation" r
WHERE r."academyId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. Stamp each one with the scout's weight as it stands now. This is the best
--    available approximation: the true weight at filing time was never recorded,
--    and leaving them all at the default 1 would understate proven scouts.
UPDATE "Recommendation" r
SET "scoutWeight" = COALESCE(s."weight", 1)
FROM "ScoutStats" s
WHERE s."userId" = r."scoutId";

-- 3. Seed the weight read-models from that history, so the aggregates are correct
--    from the first request rather than only after the next recommendation.
INSERT INTO "PlayerRecommendationWeight" ("playerId", "globalWeight", "recommendationCount", "lastRecommendedAt", "updatedAt")
SELECT r."playerId", SUM(r."scoutWeight")::double precision, COUNT(*)::int, MAX(r."createdAt"), NOW()
FROM "Recommendation" r
GROUP BY r."playerId"
ON CONFLICT ("playerId") DO NOTHING;

INSERT INTO "PlayerAcademyRecommendationWeight" ("playerId", "academyId", "extraWeight", "recommendationCount", "updatedAt")
SELECT r."playerId", t."academyId", SUM(r."scoutWeight")::double precision, COUNT(*)::int, NOW()
FROM "Recommendation" r
JOIN "RecommendationTarget" t ON t."recommendationId" = r."id"
GROUP BY r."playerId", t."academyId"
ON CONFLICT ("playerId", "academyId") DO NOTHING;
