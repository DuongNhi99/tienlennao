-- CreateTable
CREATE TABLE "matchmaking_entries" (
    "userId" UUID NOT NULL,
    "entryFee" INTEGER NOT NULL,
    "roomId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matchmaking_entries_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "matchmaking_entries_entryFee_roomId_createdAt_idx" ON "matchmaking_entries"("entryFee", "roomId", "createdAt");

-- AddForeignKey
ALTER TABLE "matchmaking_entries" ADD CONSTRAINT "matchmaking_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same rule as rooms and matches.
ALTER TABLE "matchmaking_entries" ADD CONSTRAINT "matchmaking_entries_entry_fee_non_negative" CHECK ("entryFee" >= 0);
