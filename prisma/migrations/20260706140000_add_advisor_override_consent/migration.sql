-- Add advisor override and consent confirmation fields
ALTER TABLE "IndividualOnboarding" ADD COLUMN IF NOT EXISTS "advisorOverride" BOOLEAN;
ALTER TABLE "IndividualOnboarding" ADD COLUMN IF NOT EXISTS "advisorOverrideProfile" TEXT;
ALTER TABLE "IndividualOnboarding" ADD COLUMN IF NOT EXISTS "advisorOverrideReason" TEXT;
ALTER TABLE "IndividualOnboarding" ADD COLUMN IF NOT EXISTS "consentConfirmed" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "CompanyOnboarding" ADD COLUMN IF NOT EXISTS "advisorOverride" BOOLEAN;
ALTER TABLE "CompanyOnboarding" ADD COLUMN IF NOT EXISTS "advisorOverrideProfile" TEXT;
ALTER TABLE "CompanyOnboarding" ADD COLUMN IF NOT EXISTS "advisorOverrideReason" TEXT;
ALTER TABLE "CompanyOnboarding" ADD COLUMN IF NOT EXISTS "consentConfirmed" BOOLEAN NOT NULL DEFAULT FALSE;
