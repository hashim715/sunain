-- AlterTable
ALTER TABLE "Recording" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'processing';

-- CreateTable
CREATE TABLE "RecordingSession" (
    "id" SERIAL NOT NULL,
    "meetingName" TEXT NOT NULL,
    "recordingNumber" INTEGER NOT NULL,
    "isRecording" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "RecordingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecordingSession_meetingName_key" ON "RecordingSession"("meetingName");

-- CreateIndex
CREATE INDEX "RecordingSession_meetingName_idx" ON "RecordingSession"("meetingName");
