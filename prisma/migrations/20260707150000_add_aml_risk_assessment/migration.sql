-- CreateTable: AMLRiskAssessment
CREATE TABLE IF NOT EXISTS "AMLRiskAssessment" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "data"      JSONB NOT NULL DEFAULT '{}',
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AMLRiskAssessment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AMLRiskAssessment_userId_key" ON "AMLRiskAssessment"("userId");

ALTER TABLE "AMLRiskAssessment"
  ADD CONSTRAINT "AMLRiskAssessment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
