-- What kind of coach somebody is *at this academy* — head coach, goalkeeping
-- coach, and so on. On the membership rather than the person: the same coach can
-- hold different jobs at different clubs.
ALTER TABLE "AcademyMember" ADD COLUMN "coachType" TEXT;
