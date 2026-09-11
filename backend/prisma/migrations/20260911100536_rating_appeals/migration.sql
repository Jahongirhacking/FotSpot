-- CreateEnum
CREATE TYPE "RatingAppealStatus" AS ENUM ('PENDING', 'RESOLVED');

-- AlterEnum
ALTER TYPE "NotificationEvent" ADD VALUE 'RATING_APPEAL_RESOLVED';

-- AlterEnum
ALTER TYPE "RatingSource" ADD VALUE 'ADMIN';

-- CreateTable
CREATE TABLE "RatingAppeal" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RatingAppealStatus" NOT NULL DEFAULT 'PENDING',
    "ratingAtAppeal" INTEGER,
    "decisionRating" INTEGER,
    "decisionNote" TEXT,
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "RatingAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RatingAppeal_status_createdAt_idx" ON "RatingAppeal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RatingAppeal_mediaId_status_idx" ON "RatingAppeal"("mediaId", "status");

-- AddForeignKey
ALTER TABLE "RatingAppeal" ADD CONSTRAINT "RatingAppeal_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingAppeal" ADD CONSTRAINT "RatingAppeal_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingAppeal" ADD CONSTRAINT "RatingAppeal_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
