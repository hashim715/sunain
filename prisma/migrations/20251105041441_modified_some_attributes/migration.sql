/*
  Warnings:

  - You are about to drop the column `cities` on the `User` table. All the data in the column will be lost.
  - The `year_in_cities` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "cities",
ADD COLUMN     "city" TEXT,
DROP COLUMN "year_in_cities",
ADD COLUMN     "year_in_cities" INTEGER;
