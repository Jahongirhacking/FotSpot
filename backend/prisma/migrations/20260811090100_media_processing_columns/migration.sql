-- The columns the media worker writes, and the new default.
--
-- A separate migration from the enum values it uses: Postgres refuses to use an
-- enum value added earlier in the same transaction, and Prisma runs each
-- migration file in one. Splitting them is the documented way round it.

ALTER TABLE "Media" ADD COLUMN "sizeBytes" INTEGER;
ALTER TABLE "Media" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "Media" ADD COLUMN "processedAt" TIMESTAMP(3);

-- Every clip already on the platform was accepted under the old rule and is
-- being watched right now; they stay ACTIVE and are stamped as processed so
-- nothing sweeps them up as stale. Only clips uploaded from here on go through
-- the worker.
UPDATE "Media" SET "processedAt" = "createdAt" WHERE "status" = 'ACTIVE';

ALTER TABLE "Media" ALTER COLUMN "status" SET DEFAULT 'PROCESSING';
