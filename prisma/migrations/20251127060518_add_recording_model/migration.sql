-- CreateTable
CREATE TABLE "Recording" (
    "id" SERIAL NOT NULL,
    "meetingName" TEXT NOT NULL,
    "recordingNumber" INTEGER NOT NULL,
    "participantNumber" INTEGER NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recording_meetingName_recordingNumber_idx" ON "Recording"("meetingName", "recordingNumber");
