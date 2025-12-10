-- CreateTable
CREATE TABLE "MeetingTopic" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "topicId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingTopic_meetingId_idx" ON "MeetingTopic"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingTopic_topicId_idx" ON "MeetingTopic"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingTopic_meetingId_topicId_key" ON "MeetingTopic"("meetingId", "topicId");

-- AddForeignKey
ALTER TABLE "MeetingTopic" ADD CONSTRAINT "MeetingTopic_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingTopic" ADD CONSTRAINT "MeetingTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
