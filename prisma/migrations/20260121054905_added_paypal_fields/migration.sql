/*
  Warnings:

  - You are about to drop the column `paypaylEmail` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[paypalEmail]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "users_paypaylEmail_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "paypaylEmail",
ADD COLUMN     "paypalEmail" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_paypalEmail_key" ON "users"("paypalEmail");
