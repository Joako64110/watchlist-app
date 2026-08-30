-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_userId_tmdbId_type_key"
ON "WatchlistItem"("userId", "tmdbId", "type");