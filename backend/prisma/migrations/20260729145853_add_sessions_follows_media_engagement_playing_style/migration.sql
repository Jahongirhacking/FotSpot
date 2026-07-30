-- CreateEnum
CREATE TYPE "PlayingStyle" AS ENUM ('POACHER', 'TARGET_MAN', 'DEEP_LYING_FORWARD', 'WIDE_THREAT', 'BOX_TO_BOX', 'PLAYMAKER', 'DESTROYER', 'ORCHESTRATOR', 'BALL_PLAYING_DEFENDER', 'STOPPER', 'OVERLAPPING_FULL_BACK', 'SWEEPER', 'OFFENSIVE_KEEPER', 'DEFENSIVE_KEEPER');

-- CreateEnum
CREATE TYPE "FollowTargetType" AS ENUM ('PLAYER', 'ACADEMY');

-- CreateEnum
CREATE TYPE "AcademyScoutFollowState" AS ENUM ('FOLLOWING', 'MUTED');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "refreshTokenHash";

-- AlterTable
ALTER TABLE "PlayerProfile" ADD COLUMN     "playingStyle" "PlayingStyle";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaView" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaComment" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "targetType" "FollowTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyScoutFollow" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "scoutId" TEXT NOT NULL,
    "state" "AcademyScoutFollowState" NOT NULL DEFAULT 'FOLLOWING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyScoutFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "MediaView_mediaId_idx" ON "MediaView"("mediaId");

-- CreateIndex
CREATE INDEX "MediaComment_mediaId_idx" ON "MediaComment"("mediaId");

-- CreateIndex
CREATE INDEX "Follow_targetType_targetId_idx" ON "Follow"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_targetType_targetId_key" ON "Follow"("followerId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "AcademyScoutFollow_scoutId_idx" ON "AcademyScoutFollow"("scoutId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyScoutFollow_academyId_scoutId_key" ON "AcademyScoutFollow"("academyId", "scoutId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaView" ADD CONSTRAINT "MediaView_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaComment" ADD CONSTRAINT "MediaComment_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaComment" ADD CONSTRAINT "MediaComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyScoutFollow" ADD CONSTRAINT "AcademyScoutFollow_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "AcademyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyScoutFollow" ADD CONSTRAINT "AcademyScoutFollow_scoutId_fkey" FOREIGN KEY ("scoutId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

