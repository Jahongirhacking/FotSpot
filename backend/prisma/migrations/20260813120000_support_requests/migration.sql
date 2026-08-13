-- The front door for anything the app has no button for, and the way an account
-- deletion is actually asked for.
--
-- Self-service erasure of a minor's profile is not a button worth building: it is
-- irreversible, it is exactly what a hijacked session would press, and the person
-- asking often wants something narrower — take my clips down, hide me from search
-- — that a conversation finds and a button cannot.
CREATE TYPE "SupportRequestType" AS ENUM ('DELETE_ACCOUNT', 'FEEDBACK', 'BUG', 'OTHER');

-- NEW is what the admin badge counts, so a request leaves that state only when
-- somebody has picked it up: the number on the navbar is a queue depth rather
-- than a notification anybody can dismiss.
CREATE TYPE "SupportRequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'DECLINED');

CREATE TABLE "SupportRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SupportRequestType" NOT NULL,
    "status" "SupportRequestStatus" NOT NULL DEFAULT 'NEW',
    "message" TEXT,
    "handledById" TEXT,
    "handledNote" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportRequest_status_createdAt_idx" ON "SupportRequest"("status", "createdAt");
CREATE INDEX "SupportRequest_userId_createdAt_idx" ON "SupportRequest"("userId", "createdAt");

ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull, not Cascade: an admin account being removed must not take the record
-- of what they did to somebody else's account with it.
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_handledById_fkey"
  FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
