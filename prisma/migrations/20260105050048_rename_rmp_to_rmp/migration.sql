/*
  Warnings:

  - You are about to drop the `RMP` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Log" DROP CONSTRAINT "Log_rmpId_fkey";

-- DropTable
DROP TABLE "RMP";

-- CreateTable
CREATE TABLE "Rmp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "filedDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',

    CONSTRAINT "Rmp_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "Log_rmpId_fkey" FOREIGN KEY ("rmpId") REFERENCES "Rmp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
