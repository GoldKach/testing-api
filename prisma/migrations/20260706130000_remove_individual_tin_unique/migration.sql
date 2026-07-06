-- Drop unique constraint on IndividualOnboarding.tin (TIN is now optional and non-unique)
DROP INDEX IF EXISTS "IndividualOnboarding_tin_key";
