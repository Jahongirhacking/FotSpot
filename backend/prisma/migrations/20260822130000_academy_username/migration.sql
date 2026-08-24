-- The academy's public handle, resolving /academies/@handle.
--
-- Nullable and unindexed-until-now, so both statements are safe on a populated
-- table: adding a nullable column touches only the catalogue, and the unique
-- index is built over a column where every existing row is NULL.
--
-- Postgres treats NULLs as distinct in a unique index, so every academy that has
-- not chosen a handle coexists happily — the constraint only binds once two rows
-- hold the *same* non-null value, which is exactly the rule wanted.
--
-- Nothing is backfilled. A handle is the manager's to choose and appears in a
-- public URL; inventing one from the academy name would publish a guess.
ALTER TABLE "AcademyProfile" ADD COLUMN     "username" TEXT;
CREATE UNIQUE INDEX "AcademyProfile_username_key" ON "AcademyProfile"("username");
