-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sms_attempts_reset_at" TIMESTAMP(3),
ADD COLUMN     "sms_attempts_today" INTEGER NOT NULL DEFAULT 0;
