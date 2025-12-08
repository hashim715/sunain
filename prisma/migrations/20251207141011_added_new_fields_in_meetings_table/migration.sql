/*
  Warnings:

  - Added the required column `language` to the `meetings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `participant_1_dialect` to the `meetings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `participant_2_dialect` to the `meetings` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "language" TEXT NOT NULL,
ADD COLUMN     "participant_1_dialect" TEXT NOT NULL,
ADD COLUMN     "participant_2_dialect" TEXT NOT NULL;
