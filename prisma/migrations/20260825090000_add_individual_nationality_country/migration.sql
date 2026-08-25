-- AlterTable: IndividualOnboarding — add missing nationality/countryOfResidence
-- columns that the admin "Edit Onboarding" UI and controller already
-- reference but were never persisted, causing every save that included a
-- non-blank value for either field to fail with a Prisma validation error.
ALTER TABLE "IndividualOnboarding"
  ADD COLUMN IF NOT EXISTS "nationality" TEXT,
  ADD COLUMN IF NOT EXISTS "countryOfResidence" TEXT;
