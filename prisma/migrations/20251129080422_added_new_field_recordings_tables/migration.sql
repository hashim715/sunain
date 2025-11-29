/*
  Warnings:

  - A unique constraint covering the columns `[meetingName,recordingNumber]` on the table `RecordingSession` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `recordingStartTime` to the `Recording` table without a default value. This is not possible if the table is not empty.
  - Added the required column `recordingStartTime` to the `RecordingSession` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "RecordingSession_meetingName_key";

-- AlterTable
ALTER TABLE "Recording" ADD COLUMN     "recordingStartTime" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "RecordingSession" ADD COLUMN     "recordingStartTime" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Recording_meetingName_recordingStartTime_idx" ON "Recording"("meetingName", "recordingStartTime");

-- CreateIndex
CREATE UNIQUE INDEX "RecordingSession_meetingName_recordingNumber_key" ON "RecordingSession"("meetingName", "recordingNumber");
