-- AlterTable
ALTER TABLE "users" ADD COLUMN     "verification_secret_email" TEXT,
ADD COLUMN     "verification_token_email" TEXT,
ADD COLUMN     "verification_token_expiry_email" TEXT;
