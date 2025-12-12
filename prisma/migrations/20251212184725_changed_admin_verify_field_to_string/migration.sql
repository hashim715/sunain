-- AlterTable
ALTER TABLE "users" ALTER COLUMN "adminVerify" SET DEFAULT 'waiting',
ALTER COLUMN "adminVerify" SET DATA TYPE TEXT;
