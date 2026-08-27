/*
  Warnings:

  - The `language` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "Language" AS ENUM ('es_ES', 'en_US', 'pt_BR', 'fr_FR', 'de_DE');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "language",
ADD COLUMN     "language" "Language" NOT NULL DEFAULT 'es_ES';
