-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "flagged_reasons" TEXT[],
ADD COLUMN     "flagged_status" BOOLEAN NOT NULL DEFAULT false;
