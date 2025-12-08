/*
  Warnings:

  - You are about to drop the column `participant1Dialect` on the `conversations` table. All the data in the column will be lost.
  - You are about to drop the column `participant2Dialect` on the `conversations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "conversations" DROP COLUMN "participant1Dialect",
DROP COLUMN "participant2Dialect",
ADD COLUMN     "participantDialects" TEXT[];
