-- How an online coach review began.
--
-- Additive and defaulted: the enum is new, and the column lands with a default
-- so every review written before coach discovery existed reads as
-- MANAGER_SUBMITTED — which is what it was. Postgres 11+ records the default in
-- the catalogue rather than rewriting the table, so this takes no long lock.
--
-- Nothing branches on this value. It exists so the manager's dashboard can say
-- "a coach put this player forward" rather than "the coach you sent them to
-- approved them" — two different sentences about the same decision. It is not a
-- second state machine.
CREATE TYPE "ReviewSource" AS ENUM ('MANAGER_SUBMITTED', 'COACH_DISCOVERED');
ALTER TABLE "RecommendationReview" ADD COLUMN     "source" "ReviewSource" NOT NULL DEFAULT 'MANAGER_SUBMITTED';
