-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "rematchRoomId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "rooms_rematchRoomId_key" ON "rooms"("rematchRoomId");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_rematchRoomId_fkey" FOREIGN KEY ("rematchRoomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
