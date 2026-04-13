/*
  Warnings:

  - You are about to drop the `classes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `contacts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `schools` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `streams` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'USER', 'AGENT', 'CLIENT_RELATIONS', 'ACCOUNT_MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED', 'DEACTIVATED', 'BANNED');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED', 'FROZEN');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('EQUITIES', 'ETFS', 'REITS', 'BONDS', 'CASH', 'OTHERS');

-- CreateEnum
CREATE TYPE "ReportPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "TopupStatus" AS ENUM ('PENDING', 'MERGED');

-- CreateEnum
CREATE TYPE "WalletType" AS ENUM ('MASTER', 'PORTFOLIO');

-- CreateEnum
CREATE TYPE "DepositTarget" AS ENUM ('MASTER', 'ALLOCATION');

-- CreateEnum
CREATE TYPE "WithdrawalType" AS ENUM ('HARD_WITHDRAWAL', 'REDEMPTION');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('LIMITED', 'PARTNERSHIP', 'NGO', 'COOPERATIVE', 'SAVINGS_GROUP', 'MICROFINANCE');

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('OWNERSHIP_BY_SENIOR', 'MANAGEMENT_OFFICIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "BeneficiaryRelation" AS ENUM ('SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'OTHER');

-- DropForeignKey
ALTER TABLE "streams" DROP CONSTRAINT "streams_classId_fkey";

-- DropTable
DROP TABLE "classes";

-- DropTable
DROP TABLE "contacts";

-- DropTable
DROP TABLE "schools";

-- DropTable
DROP TABLE "streams";

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL DEFAULT 'https://ylhpxhcgr4.ufs.sh/f/ZVlDsNdibGfFLkXm6f8jxEOgRvuoCGdTw7N05shB2kHlF1LU?expires=1760298626027&signature=hmac-sha256%3De5e64a05048cc6fd92c9ca7aabf68cf8a9992143d9f2bce18cfd5e7e30d6e5d4',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "token" TEXT,
    "roleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT,
    "department" TEXT,
    "position" TEXT,
    "bio" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentClientAssignment" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "unassignedAt" TIMESTAMP(3),

    CONSTRAINT "AgentClientAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterWallet" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalDeposited" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalWithdrawn" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalFees" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "netAssetValue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "maintenanceFee" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "managementFee" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "lastMaintenanceFeeDate" TIMESTAMP(3),
    "lastManagementFeeDate" TIMESTAMP(3),
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioWallet" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "userPortfolioId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "bankFee" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "transactionFee" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "feeAtBank" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalFees" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "netAssetValue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdByRole" "UserRole",
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedByName" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "masterWalletId" TEXT,
    "portfolioWalletId" TEXT,
    "userPortfolioId" TEXT,
    "depositTarget" "DepositTarget" NOT NULL DEFAULT 'MASTER',
    "amount" DOUBLE PRECISION NOT NULL,
    "transactionId" TEXT,
    "transactionStatus" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "mobileNo" TEXT,
    "referenceNo" TEXT,
    "accountNo" TEXT,
    "method" TEXT,
    "description" TEXT,
    "proofUrl" TEXT,
    "proofFileName" TEXT,
    "bankCost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "transactionCost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "cashAtBank" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalFees" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "isFirstDeposit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdByRole" "UserRole",
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedByName" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "masterWalletId" TEXT,
    "portfolioWalletId" TEXT,
    "userPortfolioId" TEXT,
    "withdrawalType" "WithdrawalType" NOT NULL DEFAULT 'HARD_WITHDRAWAL',
    "amount" DOUBLE PRECISION NOT NULL,
    "transactionStatus" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "accountNo" TEXT,
    "accountName" TEXT,
    "referenceNo" TEXT NOT NULL,
    "transactionId" TEXT,
    "method" TEXT,
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankAccountName" TEXT NOT NULL DEFAULT '',
    "bankBranch" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL DEFAULT 'OTHERS',
    "defaultAllocationPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "defaultCostPerShare" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "closePrice" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "timeHorizon" TEXT NOT NULL,
    "riskTolerance" TEXT NOT NULL,
    "allocationPercentage" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioAsset" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "defaultAllocationPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "defaultCostPerShare" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "lossGain" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "closeValue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPortfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "customName" TEXT NOT NULL,
    "portfolioValue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalInvested" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalLossGain" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPortfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPortfolioAsset" (
    "id" TEXT NOT NULL,
    "userPortfolioId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "allocationPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "costPerShare" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "closeValue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "lossGain" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPortfolioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubPortfolio" (
    "id" TEXT NOT NULL,
    "userPortfolioId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "amountInvested" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalCostPrice" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalCloseValue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalLossGain" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "bankFee" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "transactionFee" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "feeAtBank" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "totalFees" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "cashAtBank" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mergedByTopupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "topupEventId" TEXT,

    CONSTRAINT "SubPortfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubPortfolioAsset" (
    "id" TEXT NOT NULL,
    "subPortfolioId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "allocationPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "costPerShare" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "closePrice" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "closeValue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "lossGain" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubPortfolioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopupEvent" (
    "id" TEXT NOT NULL,
    "userPortfolioId" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "topupAmount" DOUBLE PRECISION NOT NULL,
    "previousTotal" DOUBLE PRECISION NOT NULL,
    "newTotalInvested" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "newTotalCloseValue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "newTotalLossGain" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "newTotalFees" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "newNetAssetValue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "status" "TopupStatus" NOT NULL DEFAULT 'PENDING',
    "mergedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopupEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cashAtBank" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "cashOutstanding" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "cashAvailable" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalInvested" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalCloseValue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalLossGain" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "netAssetValue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "module" TEXT,
    "status" TEXT,
    "description" TEXT,
    "method" TEXT,
    "platform" TEXT,
    "performedByRole" TEXT,
    "entityId" TEXT,
    "entityType" TEXT,
    "referrerUrl" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "location" TEXT,
    "isAutomated" BOOLEAN DEFAULT false,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPortfolioPerformanceReport" (
    "id" TEXT NOT NULL,
    "userPortfolioId" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period" "ReportPeriod" NOT NULL DEFAULT 'DAILY',
    "totalCostPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCloseValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalLossGain" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAssetValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPortfolioPerformanceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioAssetBreakdown" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL,
    "holdings" INTEGER NOT NULL DEFAULT 0,
    "totalCashValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioAssetBreakdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubPortfolioReportSnapshot" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "subPortfolioId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "amountInvested" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalCostPrice" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalCloseValue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalLossGain" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalFees" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "cashAtBank" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubPortfolioReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualOnboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "fullName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "tin" TEXT,
    "avatarUrl" TEXT,
    "homeAddress" TEXT,
    "email" TEXT,
    "phoneNumber" TEXT,
    "employmentStatus" TEXT,
    "occupation" TEXT,
    "companyName" TEXT,
    "hasBusiness" TEXT,
    "primaryGoal" TEXT,
    "timeHorizon" TEXT,
    "riskTolerance" TEXT,
    "investmentExperience" TEXT,
    "sourceOfIncome" TEXT,
    "employmentIncome" TEXT,
    "expectedInvestment" TEXT,
    "businessOwnership" TEXT,
    "isPEP" TEXT,
    "publicPosition" TEXT,
    "relationshipToCountry" TEXT,
    "familyMemberDetails" TEXT,
    "sanctionsOrLegal" TEXT,
    "consentToDataCollection" BOOLEAN,
    "agreeToTerms" BOOLEAN,
    "nationalIdUrl" TEXT,
    "passportPhotoUrl" TEXT,
    "tinCertificateUrl" TEXT,
    "bankStatementUrl" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndividualOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beneficiary" (
    "id" TEXT NOT NULL,
    "individualOnboardingId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "relation" "BeneficiaryRelation" NOT NULL DEFAULT 'OTHER',
    "tin" TEXT,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NextOfKin" (
    "id" TEXT NOT NULL,
    "individualOnboardingId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "relation" "BeneficiaryRelation" NOT NULL DEFAULT 'OTHER',
    "tin" TEXT,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NextOfKin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyOnboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "companyName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "logoUrl" TEXT,
    "companyType" "CompanyType" NOT NULL,
    "phoneNumbers" TEXT[],
    "registrationNumber" TEXT,
    "tin" TEXT,
    "incorporationDate" TIMESTAMP(3),
    "companyAddress" TEXT,
    "businessType" TEXT,
    "primaryGoal" TEXT,
    "timeHorizon" TEXT,
    "riskTolerance" TEXT,
    "investmentExperience" TEXT,
    "sourceOfIncome" TEXT,
    "expectedInvestment" TEXT,
    "isPEP" TEXT,
    "sanctionsOrLegal" TEXT,
    "consentToDataCollection" BOOLEAN,
    "agreeToTerms" BOOLEAN,
    "constitutionUrl" TEXT,
    "tradingLicenseUrl" TEXT,
    "bankStatementUrl" TEXT,
    "tinCertificateUrl" TEXT,
    "logoDocUrl" TEXT,
    "formA1Url" TEXT,
    "formS18Url" TEXT,
    "form18Url" TEXT,
    "form20Url" TEXT,
    "beneficialOwnershipFormUrl" TEXT,
    "memorandumArticlesUrl" TEXT,
    "officialAccountUrl" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDirector" (
    "id" TEXT NOT NULL,
    "companyOnboardingId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "ninOrPassportNumber" TEXT,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDirector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyUBO" (
    "id" TEXT NOT NULL,
    "companyOnboardingId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "ninOrPassportNumber" TEXT,
    "ownershipType" "OwnershipType" NOT NULL DEFAULT 'OTHER',
    "ownershipTypeOther" TEXT,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyUBO_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_employeeId_key" ON "StaffProfile"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentClientAssignment_clientId_key" ON "AgentClientAssignment"("clientId");

-- CreateIndex
CREATE INDEX "AgentClientAssignment_agentId_idx" ON "AgentClientAssignment"("agentId");

-- CreateIndex
CREATE INDEX "AgentClientAssignment_clientId_idx" ON "AgentClientAssignment"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterWallet_accountNumber_key" ON "MasterWallet"("accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MasterWallet_userId_key" ON "MasterWallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioWallet_accountNumber_key" ON "PortfolioWallet"("accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioWallet_userPortfolioId_key" ON "PortfolioWallet"("userPortfolioId");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_transactionId_key" ON "Deposit"("transactionId");

-- CreateIndex
CREATE INDEX "Deposit_userId_idx" ON "Deposit"("userId");

-- CreateIndex
CREATE INDEX "Deposit_createdById_idx" ON "Deposit"("createdById");

-- CreateIndex
CREATE INDEX "Deposit_userPortfolioId_idx" ON "Deposit"("userPortfolioId");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_transactionId_key" ON "Withdrawal"("transactionId");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_idx" ON "Withdrawal"("userId");

-- CreateIndex
CREATE INDEX "Withdrawal_createdById_idx" ON "Withdrawal"("createdById");

-- CreateIndex
CREATE INDEX "Withdrawal_userPortfolioId_idx" ON "Withdrawal"("userPortfolioId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_symbol_key" ON "Asset"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_name_key" ON "Portfolio"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioAsset_portfolioId_assetId_key" ON "PortfolioAsset"("portfolioId", "assetId");

-- CreateIndex
CREATE INDEX "UserPortfolio_userId_idx" ON "UserPortfolio"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPortfolio_userId_portfolioId_customName_key" ON "UserPortfolio"("userId", "portfolioId", "customName");

-- CreateIndex
CREATE UNIQUE INDEX "UserPortfolioAsset_userPortfolioId_assetId_key" ON "UserPortfolioAsset"("userPortfolioId", "assetId");

-- CreateIndex
CREATE INDEX "SubPortfolio_userPortfolioId_generation_idx" ON "SubPortfolio"("userPortfolioId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "SubPortfolioAsset_subPortfolioId_assetId_key" ON "SubPortfolioAsset"("subPortfolioId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "TopupEvent_depositId_key" ON "TopupEvent"("depositId");

-- CreateIndex
CREATE INDEX "TopupEvent_userPortfolioId_idx" ON "TopupEvent"("userPortfolioId");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_action_createdAt_idx" ON "ActivityLog"("userId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "UserPortfolioPerformanceReport_userPortfolioId_reportDate_idx" ON "UserPortfolioPerformanceReport"("userPortfolioId", "reportDate");

-- CreateIndex
CREATE INDEX "UserPortfolioPerformanceReport_reportDate_idx" ON "UserPortfolioPerformanceReport"("reportDate");

-- CreateIndex
CREATE INDEX "UserPortfolioPerformanceReport_userPortfolioId_period_repor_idx" ON "UserPortfolioPerformanceReport"("userPortfolioId", "period", "reportDate");

-- CreateIndex
CREATE INDEX "PortfolioAssetBreakdown_reportId_idx" ON "PortfolioAssetBreakdown"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioAssetBreakdown_reportId_assetClass_key" ON "PortfolioAssetBreakdown"("reportId", "assetClass");

-- CreateIndex
CREATE INDEX "SubPortfolioReportSnapshot_reportId_idx" ON "SubPortfolioReportSnapshot"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "IndividualOnboarding_userId_key" ON "IndividualOnboarding"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IndividualOnboarding_tin_key" ON "IndividualOnboarding"("tin");

-- CreateIndex
CREATE INDEX "Beneficiary_individualOnboardingId_idx" ON "Beneficiary"("individualOnboardingId");

-- CreateIndex
CREATE INDEX "NextOfKin_individualOnboardingId_idx" ON "NextOfKin"("individualOnboardingId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyOnboarding_userId_key" ON "CompanyOnboarding"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyOnboarding_registrationNumber_key" ON "CompanyOnboarding"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyOnboarding_tin_key" ON "CompanyOnboarding"("tin");

-- CreateIndex
CREATE INDEX "CompanyDirector_companyOnboardingId_idx" ON "CompanyDirector"("companyOnboardingId");

-- CreateIndex
CREATE INDEX "CompanyUBO_companyOnboardingId_idx" ON "CompanyUBO"("companyOnboardingId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentClientAssignment" ADD CONSTRAINT "AgentClientAssignment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentClientAssignment" ADD CONSTRAINT "AgentClientAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterWallet" ADD CONSTRAINT "MasterWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioWallet" ADD CONSTRAINT "PortfolioWallet_userPortfolioId_fkey" FOREIGN KEY ("userPortfolioId") REFERENCES "UserPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_masterWalletId_fkey" FOREIGN KEY ("masterWalletId") REFERENCES "MasterWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_portfolioWalletId_fkey" FOREIGN KEY ("portfolioWalletId") REFERENCES "PortfolioWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userPortfolioId_fkey" FOREIGN KEY ("userPortfolioId") REFERENCES "UserPortfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_masterWalletId_fkey" FOREIGN KEY ("masterWalletId") REFERENCES "MasterWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_portfolioWalletId_fkey" FOREIGN KEY ("portfolioWalletId") REFERENCES "PortfolioWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userPortfolioId_fkey" FOREIGN KEY ("userPortfolioId") REFERENCES "UserPortfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioAsset" ADD CONSTRAINT "PortfolioAsset_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioAsset" ADD CONSTRAINT "PortfolioAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPortfolio" ADD CONSTRAINT "UserPortfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPortfolio" ADD CONSTRAINT "UserPortfolio_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPortfolioAsset" ADD CONSTRAINT "UserPortfolioAsset_userPortfolioId_fkey" FOREIGN KEY ("userPortfolioId") REFERENCES "UserPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPortfolioAsset" ADD CONSTRAINT "UserPortfolioAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubPortfolio" ADD CONSTRAINT "SubPortfolio_userPortfolioId_fkey" FOREIGN KEY ("userPortfolioId") REFERENCES "UserPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubPortfolio" ADD CONSTRAINT "SubPortfolio_topupEventId_fkey" FOREIGN KEY ("topupEventId") REFERENCES "TopupEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubPortfolioAsset" ADD CONSTRAINT "SubPortfolioAsset_subPortfolioId_fkey" FOREIGN KEY ("subPortfolioId") REFERENCES "SubPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubPortfolioAsset" ADD CONSTRAINT "SubPortfolioAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopupEvent" ADD CONSTRAINT "TopupEvent_userPortfolioId_fkey" FOREIGN KEY ("userPortfolioId") REFERENCES "UserPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopupEvent" ADD CONSTRAINT "TopupEvent_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "Deposit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSummary" ADD CONSTRAINT "PortfolioSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPortfolioPerformanceReport" ADD CONSTRAINT "UserPortfolioPerformanceReport_userPortfolioId_fkey" FOREIGN KEY ("userPortfolioId") REFERENCES "UserPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioAssetBreakdown" ADD CONSTRAINT "PortfolioAssetBreakdown_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "UserPortfolioPerformanceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubPortfolioReportSnapshot" ADD CONSTRAINT "SubPortfolioReportSnapshot_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "UserPortfolioPerformanceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualOnboarding" ADD CONSTRAINT "IndividualOnboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualOnboarding" ADD CONSTRAINT "IndividualOnboarding_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_individualOnboardingId_fkey" FOREIGN KEY ("individualOnboardingId") REFERENCES "IndividualOnboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NextOfKin" ADD CONSTRAINT "NextOfKin_individualOnboardingId_fkey" FOREIGN KEY ("individualOnboardingId") REFERENCES "IndividualOnboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyOnboarding" ADD CONSTRAINT "CompanyOnboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyOnboarding" ADD CONSTRAINT "CompanyOnboarding_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDirector" ADD CONSTRAINT "CompanyDirector_companyOnboardingId_fkey" FOREIGN KEY ("companyOnboardingId") REFERENCES "CompanyOnboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUBO" ADD CONSTRAINT "CompanyUBO_companyOnboardingId_fkey" FOREIGN KEY ("companyOnboardingId") REFERENCES "CompanyOnboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
