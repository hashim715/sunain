-- AlterTable
ALTER TABLE "users" ADD COLUMN     "instaPayEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "instaPayPhone" VARCHAR(255);
