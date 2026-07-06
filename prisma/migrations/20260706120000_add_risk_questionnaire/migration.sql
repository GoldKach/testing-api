-- AlterTable: IndividualOnboarding — add risk questionnaire fields
ALTER TABLE "IndividualOnboarding" ADD COLUMN IF NOT EXISTS "riskQuestionnaire" JSONB;
ALTER TABLE "IndividualOnboarding" ADD COLUMN IF NOT EXISTS "riskScore" INTEGER;
ALTER TABLE "IndividualOnboarding" ADD COLUMN IF NOT EXISTS "riskProfile" TEXT;
ALTER TABLE "IndividualOnboarding" ADD COLUMN IF NOT EXISTS "suggestedStrategy" TEXT;

-- AlterTable: CompanyOnboarding — add risk questionnaire fields
ALTER TABLE "CompanyOnboarding" ADD COLUMN IF NOT EXISTS "riskQuestionnaire" JSONB;
ALTER TABLE "CompanyOnboarding" ADD COLUMN IF NOT EXISTS "riskScore" INTEGER;
ALTER TABLE "CompanyOnboarding" ADD COLUMN IF NOT EXISTS "riskProfile" TEXT;
ALTER TABLE "CompanyOnboarding" ADD COLUMN IF NOT EXISTS "suggestedStrategy" TEXT;
