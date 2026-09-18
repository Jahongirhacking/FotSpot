-- CreateTable
CREATE TABLE "ProfessionalPlayer" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "avatarKey" TEXT,
    "position" TEXT,
    "dominantFoot" "DominantFoot",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalPlayerAcademy" (
    "professionalPlayerId" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionalPlayerAcademy_pkey" PRIMARY KEY ("professionalPlayerId","academyId")
);

-- CreateIndex
CREATE INDEX "ProfessionalPlayer_lastName_firstName_idx" ON "ProfessionalPlayer"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "ProfessionalPlayerAcademy_academyId_idx" ON "ProfessionalPlayerAcademy"("academyId");

-- AddForeignKey
ALTER TABLE "ProfessionalPlayerAcademy" ADD CONSTRAINT "ProfessionalPlayerAcademy_professionalPlayerId_fkey" FOREIGN KEY ("professionalPlayerId") REFERENCES "ProfessionalPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalPlayerAcademy" ADD CONSTRAINT "ProfessionalPlayerAcademy_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "AcademyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
