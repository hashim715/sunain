/*
  Warnings:

  - You are about to drop the column `annotator` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "annotator",
ADD COLUMN     "is_annotator" BOOLEAN NOT NULL DEFAULT false;
