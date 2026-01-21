/*
  Warnings:

  - A unique constraint covering the columns `[paypaylEmail]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "paypalPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paypaylEmail" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_paypaylEmail_key" ON "users"("paypaylEmail");
