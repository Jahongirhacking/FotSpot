/*
  Warnings:

  - The values [POACHER,TARGET_MAN,WIDE_THREAT,BALL_PLAYING_DEFENDER,STOPPER,OVERLAPPING_FULL_BACK,SWEEPER] on the enum `PlayingStyle` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PlayingStyle_new" AS ENUM ('GOAL_POACHER', 'FOX_IN_THE_BOX', 'DEEP_LYING_FORWARD', 'PROLIFIC_WINGER', 'CLASSIC_10', 'BOX_TO_BOX', 'PLAYMAKER', 'ANCHOR_MAN', 'ORCHESTRATOR', 'BUILD_UP', 'DEFENSIVE_FULLBACK', 'OFFENSIVE_WINGBACK', 'DESTROYER', 'OFFENSIVE_KEEPER', 'DEFENSIVE_KEEPER');
ALTER TABLE "PlayerProfile" ALTER COLUMN "playingStyle" TYPE "PlayingStyle_new" USING ("playingStyle"::text::"PlayingStyle_new");
ALTER TYPE "PlayingStyle" RENAME TO "PlayingStyle_old";
ALTER TYPE "PlayingStyle_new" RENAME TO "PlayingStyle";
DROP TYPE "public"."PlayingStyle_old";
COMMIT;
