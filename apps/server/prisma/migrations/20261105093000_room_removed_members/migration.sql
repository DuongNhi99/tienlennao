-- Players and spectators removed by the host cannot rejoin the room.
ALTER TABLE "rooms" ADD COLUMN     "removedUserIds" UUID[] DEFAULT ARRAY[]::UUID[];
