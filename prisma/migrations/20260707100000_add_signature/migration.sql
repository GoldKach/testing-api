-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SignatureType" AS ENUM ('DRAWN', 'UPLOADED', 'TYPED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Signature" (
  "id"               TEXT        NOT NULL,
  "userId"           TEXT        NOT NULL,
  "signatureType"    "SignatureType" NOT NULL,
  "imageUrl"         TEXT,
  "typedName"        TEXT,
  "signedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "agreementVersion" TEXT,
  "ipAddress"        TEXT,
  "userAgent"        TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Signature_userId_key" ON "Signature"("userId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Signature"
    ADD CONSTRAINT "Signature_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
