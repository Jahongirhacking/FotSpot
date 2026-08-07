-- TRIAL.md Rule 22: neither an Online Coach Review nor a Trial verdict may write
-- attribute ratings, so neither row links to a CoachAssessment any more.
--
-- The assessments themselves are not touched. Attribute scoring moves to the one
-- place it belongs -- a coach and a player who share a squad group (Rule 21) --
-- through POST /coaches/assessments.
ALTER TABLE "RecommendationReview" DROP COLUMN "assessmentId";

ALTER TABLE "TrialResult" DROP COLUMN "assessmentId";
