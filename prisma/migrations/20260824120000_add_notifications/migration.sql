-- CreateEnum: NotificationType
DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM (
    'ONBOARDING_APPROVED',
    'DEPOSIT_RECEIVED',
    'DEPOSIT_APPROVED',
    'WITHDRAWAL_RECEIVED',
    'WITHDRAWAL_APPROVED',
    'REDEMPTION_APPROVED',
    'PORTFOLIO_ALLOCATED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: Notification
CREATE TABLE IF NOT EXISTS "Notification" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "type"      "NotificationType" NOT NULL,
  "title"     TEXT NOT NULL,
  "message"   TEXT NOT NULL,
  "meta"      JSONB,
  "isRead"    BOOLEAN NOT NULL DEFAULT false,
  "readAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
