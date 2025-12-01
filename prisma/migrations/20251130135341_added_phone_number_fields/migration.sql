-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isUserRegistered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verification_secret" TEXT,
ADD COLUMN     "verification_token" TEXT,
ADD COLUMN     "verification_token_expiry" TEXT;
