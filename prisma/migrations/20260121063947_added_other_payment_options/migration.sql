-- AlterTable
ALTER TABLE "users" ADD COLUMN     "revolutEmail" VARCHAR(255),
ADD COLUMN     "revolutePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wiseEmail" VARCHAR(255),
ADD COLUMN     "wisePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
