-- Who caused a notification, and in what capacity.
--
-- "A coach accepted a player" and "the academy accepted a player" read very
-- differently to whoever receives the message, and a notification used to say
-- neither — only what happened.
--
-- `actorRole` is a stored string rather than a derived one: a user holds several
-- roles at once and only the caller knows which was acting. A scout who is also
-- a coach rejecting somebody did it as a coach, and the row should still say so
-- a year later even if they have stopped being either.
--
-- Both nullable, for the events nobody triggered — a scheduled job, or a rule
-- firing on its own. Existing rows keep both null, which is the honest answer
-- for notifications written before anybody recorded an actor.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "actorRole" TEXT,
ADD COLUMN     "actorUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
