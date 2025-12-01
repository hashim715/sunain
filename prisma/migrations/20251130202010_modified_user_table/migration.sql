/*
  Warnings:

  - You are about to drop the column `hear_about_us` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `language_apply_for` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `languages` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `languages_rating` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "hear_about_us",
DROP COLUMN "language_apply_for",
DROP COLUMN "languages",
DROP COLUMN "languages_rating",
ADD COLUMN     "language" TEXT;
