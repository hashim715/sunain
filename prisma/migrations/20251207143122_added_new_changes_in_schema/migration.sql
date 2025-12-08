/*
  Warnings:

  - You are about to drop the column `duration` on the `meetings` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `meetings` table. All the data in the column will be lost.
  - You are about to drop the column `joined_at` on the `meetings` table. All the data in the column will be lost.
  - You are about to drop the column `left_at` on the `meetings` table. All the data in the column will be lost.
  - You are about to drop the column `participant_1_dialect` on the `meetings` table. All the data in the column will be lost.
  - You are about to drop the column `participant_2_dialect` on the `meetings` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `meetings` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `meetings` table. All the data in the column will be lost.
  - You are about to drop the `Recording` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RecordingSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[sessionName]` on the table `meetings` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "meetings" DROP CONSTRAINT "meetings_user_id_fkey";

-- DropIndex
DROP INDEX "meetings_is_active_idx";

-- DropIndex
DROP INDEX "meetings_user_id_idx";

-- AlterTable
ALTER TABLE "meetings" DROP COLUMN "duration",
DROP COLUMN "is_active",
DROP COLUMN "joined_at",
DROP COLUMN "left_at",
DROP COLUMN "participant_1_dialect",
DROP COLUMN "participant_2_dialect",
DROP COLUMN "role",
DROP COLUMN "user_id",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "Recording";

-- DropTable
DROP TABLE "RecordingSession";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT,
    "google_login" BOOLEAN NOT NULL DEFAULT false,
    "google_access_token" TEXT,
    "google_refresh_token" TEXT,
    "google_token_expiry" TEXT,
    "expiresAt" TEXT,
    "phone_number" TEXT,
    "profile_image" TEXT,
    "details_added" BOOLEAN NOT NULL DEFAULT false,
    "date_of_birth" TEXT,
    "gender" TEXT,
    "race" TEXT,
    "area_grown_up" TEXT,
    "language" TEXT,
    "city" TEXT,
    "language_dialect" TEXT,
    "education_level" TEXT,
    "language_skills" TEXT[] DEFAULT ARRAY['Speaking', 'Listening', 'Reading', 'Writing']::TEXT[],
    "language_proficieny" INTEGER[],
    "language_use" TEXT[],
    "quiz_answers" TEXT[],
    "user_type" TEXT NOT NULL DEFAULT 'user',
    "verification_token" TEXT,
    "verification_secret" TEXT,
    "verification_token_expiry" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "adminVerify" BOOLEAN NOT NULL DEFAULT false,
    "stripeAccountId" TEXT,
    "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "audio_sample_url" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'participant',
    "dialect" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "duration" INTEGER,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "participant1Dialect" TEXT,
    "participant2Dialect" TEXT,
    "duration" INTEGER NOT NULL,
    "quality" INTEGER NOT NULL,
    "earnings" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "notes" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" SERIAL NOT NULL,
    "meetingName" TEXT NOT NULL,
    "recordingNumber" INTEGER NOT NULL,
    "participantNumber" INTEGER NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "recordingStartTime" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_sessions" (
    "id" SERIAL NOT NULL,
    "meetingName" TEXT NOT NULL,
    "recordingNumber" INTEGER NOT NULL,
    "recordingStartTime" TIMESTAMP(3) NOT NULL,
    "recordingEndTime" TIMESTAMP(3),
    "isRecording" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "recording_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripeAccountId_key" ON "users"("stripeAccountId");

-- CreateIndex
CREATE INDEX "meeting_participants_userId_idx" ON "meeting_participants"("userId");

-- CreateIndex
CREATE INDEX "meeting_participants_meetingId_idx" ON "meeting_participants"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_participants_meetingId_userId_key" ON "meeting_participants"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "conversations_userId_idx" ON "conversations"("userId");

-- CreateIndex
CREATE INDEX "conversations_meetingId_idx" ON "conversations"("meetingId");

-- CreateIndex
CREATE INDEX "conversations_status_idx" ON "conversations"("status");

-- CreateIndex
CREATE INDEX "recordings_meetingName_recordingNumber_idx" ON "recordings"("meetingName", "recordingNumber");

-- CreateIndex
CREATE INDEX "recordings_meetingName_recordingStartTime_idx" ON "recordings"("meetingName", "recordingStartTime");

-- CreateIndex
CREATE INDEX "recording_sessions_meetingName_idx" ON "recording_sessions"("meetingName");

-- CreateIndex
CREATE UNIQUE INDEX "recording_sessions_meetingName_recordingNumber_key" ON "recording_sessions"("meetingName", "recordingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_sessionName_key" ON "meetings"("sessionName");

-- CreateIndex
CREATE INDEX "meetings_isActive_idx" ON "meetings"("isActive");

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
