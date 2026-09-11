/*
  Warnings:

  - You are about to drop the column `authorName` on the `BlogPost` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "BlogPost" DROP COLUMN "authorName",
ADD COLUMN     "authorAcademyId" TEXT;

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_authorAcademyId_fkey" FOREIGN KEY ("authorAcademyId") REFERENCES "AcademyProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
