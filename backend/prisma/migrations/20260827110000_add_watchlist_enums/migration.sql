-- CreateEnum
CREATE TYPE "WatchlistType" AS ENUM ('movie', 'tv');

-- CreateEnum
CREATE TYPE "WatchlistStatus" AS ENUM ('pending', 'watching', 'watched');

-- AlterTable
ALTER TABLE "WatchlistItem"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "type" TYPE "WatchlistType" USING "type"::"WatchlistType",
  ALTER COLUMN "status" TYPE "WatchlistStatus" USING "status"::"WatchlistStatus",
  ALTER COLUMN "status" SET DEFAULT 'pending'::"WatchlistStatus";