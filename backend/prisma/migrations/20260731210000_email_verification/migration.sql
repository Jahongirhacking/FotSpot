-- Registration now proves the email address with a code before creating the
-- account, so a new row is verified by construction. Existing rows predate the
-- requirement and are left null rather than back-dated to a moment that never
-- happened.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
