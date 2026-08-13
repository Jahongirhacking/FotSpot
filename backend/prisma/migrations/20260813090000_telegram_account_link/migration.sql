-- Telegram sign-in identifies a person by their Telegram id.
--
-- The Login Widget does not disclose a phone number — that is only obtainable by
-- asking inside a chat, which a login button is not — so the id is what a
-- returning Telegram user is recognised by. Matching on `phone` would mean
-- matching on something Telegram never sends.
--
-- Unique because it is a credential: two accounts carrying the same Telegram id
-- would make "sign in with Telegram" ambiguous, and an ambiguity in an
-- authentication lookup resolves to whichever row came back first.
ALTER TABLE "User" ADD COLUMN "telegramId" TEXT;

CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
