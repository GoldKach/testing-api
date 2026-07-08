-- AlterTable IndividualOnboarding: add signedAgreementUrl column
ALTER TABLE "IndividualOnboarding" ADD COLUMN IF NOT EXISTS "signedAgreementUrl" TEXT;
