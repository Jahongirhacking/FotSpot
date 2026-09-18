-- AlterEnum
ALTER TYPE "ReportType" ADD VALUE 'RECOMMENDATION';

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedByUserId" TEXT,
ADD COLUMN     "targetRecommendationId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "restrictedAt" TIMESTAMP(3),
ADD COLUMN     "restrictionReason" TEXT;

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_targetRecommendationId_reporterId_idx" ON "Report"("targetRecommendationId", "reporterId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_targetRecommendationId_fkey" FOREIGN KEY ("targetRecommendationId") REFERENCES "Recommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
