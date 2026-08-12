-- The Trials menu badge, and the alert a matching player gets.

-- When the account last opened the trials list. Null = never, so everything
-- currently open reads as new, which is the right welcome for a new account.
ALTER TABLE "User" ADD COLUMN "trialsSeenAt" TIMESTAMP(3);

-- Sent on creation to the players a trial is actually for — matched on the
-- academy's own wanted positions and age range.
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'TRIAL_PUBLISHED' AFTER 'TRIAL_INVITATION';
