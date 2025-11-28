/*
  Warnings:

  - You are about to drop the column `year_in_cities` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "year_in_cities",
ADD COLUMN     "year_in_city" INTEGER;
