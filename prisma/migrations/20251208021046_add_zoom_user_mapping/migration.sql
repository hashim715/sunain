-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "recordingId" INTEGER;

-- AlterTable
ALTER TABLE "recordings" ADD COLUMN     "userId" INTEGER,
ADD COLUMN     "zoomUserId" TEXT,
ADD COLUMN     "zoomUserKey" TEXT;

-- CreateIndex
CREATE INDEX "conversations_recordingId_idx" ON "conversations"("recordingId");

-- CreateIndex
CREATE INDEX "recordings_zoomUserId_idx" ON "recordings"("zoomUserId");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
