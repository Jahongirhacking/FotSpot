-- Proof that someone controls an email address before an account exists for it.
-- Kept apart from VerificationCode (which needs a userId) and OtpCode (which is
-- keyed on a phone number) rather than bending either to fit.
CREATE TABLE "RegistrationCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RegistrationCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RegistrationCode_email_consumed_idx" ON "RegistrationCode"("email", "consumed");
