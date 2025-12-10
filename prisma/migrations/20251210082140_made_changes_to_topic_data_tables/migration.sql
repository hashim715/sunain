/*
  Warnings:

  - The primary key for the `ConversationStarter` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `ConversationStarter` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Example` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Example` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Subtopic` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Subtopic` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Topic` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Topic` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Vocabulary` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Vocabulary` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `subtopicId` on the `ConversationStarter` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `subtopicId` on the `Example` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `topicId` on the `Subtopic` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `subtopicId` on the `Vocabulary` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "ConversationStarter" DROP CONSTRAINT "ConversationStarter_subtopicId_fkey";

-- DropForeignKey
ALTER TABLE "Example" DROP CONSTRAINT "Example_subtopicId_fkey";

-- DropForeignKey
ALTER TABLE "Subtopic" DROP CONSTRAINT "Subtopic_topicId_fkey";

-- DropForeignKey
ALTER TABLE "Vocabulary" DROP CONSTRAINT "Vocabulary_subtopicId_fkey";

-- AlterTable
ALTER TABLE "ConversationStarter" DROP CONSTRAINT "ConversationStarter_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "subtopicId",
ADD COLUMN     "subtopicId" INTEGER NOT NULL,
ADD CONSTRAINT "ConversationStarter_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Example" DROP CONSTRAINT "Example_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "subtopicId",
ADD COLUMN     "subtopicId" INTEGER NOT NULL,
ADD CONSTRAINT "Example_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Subtopic" DROP CONSTRAINT "Subtopic_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "topicId",
ADD COLUMN     "topicId" INTEGER NOT NULL,
ADD CONSTRAINT "Subtopic_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Topic" DROP CONSTRAINT "Topic_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Topic_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Vocabulary" DROP CONSTRAINT "Vocabulary_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "subtopicId",
ADD COLUMN     "subtopicId" INTEGER NOT NULL,
ADD CONSTRAINT "Vocabulary_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "ConversationStarter_subtopicId_idx" ON "ConversationStarter"("subtopicId");

-- CreateIndex
CREATE INDEX "Example_subtopicId_idx" ON "Example"("subtopicId");

-- CreateIndex
CREATE INDEX "Subtopic_topicId_idx" ON "Subtopic"("topicId");

-- CreateIndex
CREATE INDEX "Vocabulary_subtopicId_idx" ON "Vocabulary"("subtopicId");

-- AddForeignKey
ALTER TABLE "Subtopic" ADD CONSTRAINT "Subtopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vocabulary" ADD CONSTRAINT "Vocabulary_subtopicId_fkey" FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationStarter" ADD CONSTRAINT "ConversationStarter_subtopicId_fkey" FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Example" ADD CONSTRAINT "Example_subtopicId_fkey" FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
