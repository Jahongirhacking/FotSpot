-- A player-facing note on every trial, and the academy's default for it.
--
-- Both hold sanitised HTML: an academy writes what a family needs to know — what
-- to bring, where to park, who to ask for — and that reads as a list rather than
-- a paragraph. Everything written here has been through `sanitizeRichText`, so a
-- row containing a script tag could not have come from this API.
--
-- The default is copied into a trial at creation, never joined at read time: a
-- trial that has already happened should keep the words the family actually
-- read, not whatever the academy's default says a year later.

-- AlterTable
ALTER TABLE "AcademyProfile" ADD COLUMN     "defaultTrialNote" TEXT;

-- AlterTable
ALTER TABLE "Trial" ADD COLUMN     "note" TEXT;
