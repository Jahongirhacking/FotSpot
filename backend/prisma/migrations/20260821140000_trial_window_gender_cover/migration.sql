-- Open-ended trials, a daily time window, a gender, and an optional cover.
--
-- Every operation here is safe on a populated table and takes no long lock:
--
--   * the four ADD COLUMNs are nullable or defaulted, and Postgres 11+ records a
--     column default in the catalogue rather than rewriting every row;
--   * DROP NOT NULL is a catalogue change — it relaxes a constraint, so no
--     existing row can violate it and nothing is scanned.
--
-- Nothing is backfilled, deliberately. Every existing trial keeps the exam
-- datetime it already had in "date", with "endDate" null — which is exactly what
-- a single-day trial means under the new shape, so old rows carry on reading the
-- way they always did. `gender` defaults to 'male' so no row is left with a null
-- that every reader would have to interpret.
--
-- The reverse is the one thing to know before deploying: once an open-ended
-- trial exists (date IS NULL), re-adding NOT NULL to "date" would fail. Rolling
-- this back needs those rows given a date first.
ALTER TABLE "Trial" ADD COLUMN     "coverKey" TEXT,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "gender" TEXT NOT NULL DEFAULT 'male',
ADD COLUMN     "startTime" TEXT,
ALTER COLUMN "date" DROP NOT NULL;
