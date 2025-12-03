/*
  Warnings:

  - Added the required column `recordingEndTime` to the `Recording` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Recording" ADD COLUMN     "recordingEndTime" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Recording_meetingName_recordingEndTime_idx" ON "Recording"("meetingName", "recordingEndTime");
