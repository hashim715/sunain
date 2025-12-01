/*
  Warnings:

  - You are about to drop the column `session_name` on the `meetings` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "meetings_session_name_idx";

-- DropIndex
DROP INDEX "meetings_session_name_key";

-- AlterTable
ALTER TABLE "meetings" DROP COLUMN "session_name",
ADD COLUMN     "sessionName" TEXT NOT NULL DEFAULT '8ec95f9a-b36c-4a7a-8d38-61539a741953';

-- CreateIndex
CREATE INDEX "meetings_sessionName_idx" ON "meetings"("sessionName");
