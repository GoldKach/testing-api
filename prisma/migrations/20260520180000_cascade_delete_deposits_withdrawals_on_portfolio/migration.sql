-- When a UserPortfolio is deleted, cascade-delete its Deposits and Withdrawals.
-- Previously the FK had no onDelete (defaulted to SetNull), which left orphaned rows.

-- Deposit → UserPortfolio FK
ALTER TABLE "Deposit"
  DROP CONSTRAINT IF EXISTS "Deposit_userPortfolioId_fkey";

ALTER TABLE "Deposit"
  ADD CONSTRAINT "Deposit_userPortfolioId_fkey"
  FOREIGN KEY ("userPortfolioId")
  REFERENCES "UserPortfolio"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Withdrawal → UserPortfolio FK
ALTER TABLE "Withdrawal"
  DROP CONSTRAINT IF EXISTS "Withdrawal_userPortfolioId_fkey";

ALTER TABLE "Withdrawal"
  ADD CONSTRAINT "Withdrawal_userPortfolioId_fkey"
  FOREIGN KEY ("userPortfolioId")
  REFERENCES "UserPortfolio"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
