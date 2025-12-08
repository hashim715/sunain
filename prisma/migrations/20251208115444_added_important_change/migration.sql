/*
  Warnings:

  - You are about to drop the column `zoomUserId` on the `meeting_participants` table. All the data in the column will be lost.
  - You are about to drop the column `zoomUserKey` on the `meeting_participants` table. All the data in the column will be lost.
  - You are about to drop the column `zoomUserId` on the `recordings` table. All the data in the column will be lost.
  - You are about to drop the column `zoomUserKey` on the `recordings` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "recordings_zoomUserId_idx";

-- AlterTable
ALTER TABLE "meeting_participants" DROP COLUMN "zoomUserId",
DROP COLUMN "zoomUserKey";

-- AlterTable
ALTER TABLE "recordings" DROP COLUMN "zoomUserId",
DROP COLUMN "zoomUserKey";
