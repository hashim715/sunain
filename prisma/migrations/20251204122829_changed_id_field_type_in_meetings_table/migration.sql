/*
  Warnings:

  - The primary key for the `meetings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `meetings` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "meetings" DROP CONSTRAINT "meetings_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "meetings_pkey" PRIMARY KEY ("id");
