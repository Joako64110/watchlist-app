/*
  Warnings:

  - You are about to drop the column `estado` on the `WatchlistItem` table. All the data in the column will be lost.
  - You are about to drop the column `nota` on the `WatchlistItem` table. All the data in the column will be lost.
  - You are about to drop the column `puntuacion` on the `WatchlistItem` table. All the data in the column will be lost.
  - You are about to drop the column `tipo` on the `WatchlistItem` table. All the data in the column will be lost.
  - Added the required column `type` to the `WatchlistItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WatchlistItem" DROP COLUMN "estado",
DROP COLUMN "nota",
DROP COLUMN "puntuacion",
DROP COLUMN "tipo",
ADD COLUMN     "note" TEXT,
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "type" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "WatchlistItem_userId_idx" ON "WatchlistItem"("userId");
