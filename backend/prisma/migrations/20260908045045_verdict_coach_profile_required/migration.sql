/*
  Warnings:

  - Made the column `coachProfileId` on table `TrialResult` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "TrialResult" ALTER COLUMN "coachProfileId" SET NOT NULL;
