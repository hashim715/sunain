/*
  Warnings:

  - You are about to drop the column `annotation_dirs` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "annotation_dirs",
ADD COLUMN     "annotation_recordings" TEXT[] DEFAULT ARRAY[]::TEXT[];
