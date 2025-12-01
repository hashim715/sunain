/*
  Warnings:

  - You are about to drop the column `channels` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `language_use_types` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `meetings_attended` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "channels",
DROP COLUMN "language_use_types",
DROP COLUMN "meetings_attended";

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "session_name" TEXT NOT NULL,
    "passcode" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'participant',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "duration" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meetings_session_name_key" ON "meetings"("session_name");

-- CreateIndex
CREATE INDEX "meetings_user_id_idx" ON "meetings"("user_id");

-- CreateIndex
CREATE INDEX "meetings_session_name_idx" ON "meetings"("session_name");

-- CreateIndex
CREATE INDEX "meetings_is_active_idx" ON "meetings"("is_active");

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
