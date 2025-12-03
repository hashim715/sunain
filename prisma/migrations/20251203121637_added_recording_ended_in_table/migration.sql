/*
  Warnings:

  - You are about to drop the column `recordingEndTime` on the `Recording` table. All the data in the column will be lost.
  - Added the required column `recordingEndTime` to the `RecordingSession` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Recording_meetingName_recordingEndTime_idx";

-- AlterTable
ALTER TABLE "Recording" DROP COLUMN "recordingEndTime";

-- AlterTable
ALTER TABLE "RecordingSession" ADD COLUMN     "recordingEndTime" TIMESTAMP(3) NOT NULL;
