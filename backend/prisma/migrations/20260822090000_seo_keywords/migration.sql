-- SEO keywords for academies and trials.
--
-- Both are additive, nullable-by-default text arrays with an empty default, so
-- neither rewrites the table and neither can fail on existing data: every
-- academy and every trial already written gets `{}`, which is exactly what §21
-- asks for. Nothing is backfilled and no existing content is touched — a
-- keyword is something an operator chooses, not something to invent from a name.
ALTER TABLE "AcademyProfile" ADD COLUMN     "seoKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Trial" ADD COLUMN     "seoKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
