-- Tells an academy manager a coach accepted a player at online review.
--
-- Its own event rather than reusing REVIEW_ASSIGNED, which means "you have been
-- handed a player to judge" and is addressed to a coach. The manager is being
-- told the opposite: somebody else has judged, and the invitation is now theirs
-- to send. Only acceptances are sent — a rejection asks nothing of them.

-- AlterEnum
ALTER TYPE "NotificationEvent" ADD VALUE 'REVIEW_DECIDED';
