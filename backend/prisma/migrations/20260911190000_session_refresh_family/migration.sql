-- A session accepts a small family of refresh tokens rather than exactly one,
-- so two tabs rotating the same token within a minute of each other are not
-- read as theft. Existing rows keep their argon2 hash and join the family on
-- their next refresh.

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "activeRefreshHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "retiringRefreshHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "retiredAt" TIMESTAMP(3);
