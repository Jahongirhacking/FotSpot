-- CreateTable
CREATE TABLE "TrialApplicationBacking" (
    "applicationId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialApplicationBacking_pkey" PRIMARY KEY ("applicationId","recommendationId")
);

-- CreateIndex
CREATE INDEX "TrialApplicationBacking_recommendationId_idx" ON "TrialApplicationBacking"("recommendationId");

-- AddForeignKey
ALTER TABLE "TrialApplicationBacking" ADD CONSTRAINT "TrialApplicationBacking_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "TrialApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialApplicationBacking" ADD CONSTRAINT "TrialApplicationBacking_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

