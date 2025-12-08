/*
  Warnings:

  - You are about to alter the column `duration` on the `conversations` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(10,2)`.
  - You are about to alter the column `quality` on the `conversations` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(10,2)`.

*/
-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "duration" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "quality" SET DATA TYPE DECIMAL(10,2);
