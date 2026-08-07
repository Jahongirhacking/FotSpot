-- A private trial has no eligibility rules, because it is not open to anybody.
--
-- An age range answers "may I apply?" and a private trial's answer is no: it
-- exists for one named child who was already chosen. Storing their exact age
-- there was a number that looked like a rule and was really a fact about one
-- person — and it was shown back to them as a restriction they had passed.
--
-- SQUAD_PLACEMENT is the news a player gets when an academy takes them on after
-- a trial. Separate from the join invitation the same action sends: that is
-- paperwork awaiting a yes, this is being told they were wanted.

-- AlterEnum
ALTER TYPE "NotificationEvent" ADD VALUE 'SQUAD_PLACEMENT';

-- AlterTable
ALTER TABLE "Trial" ALTER COLUMN "ageRangeMin" DROP NOT NULL,
ALTER COLUMN "ageRangeMax" DROP NOT NULL;
