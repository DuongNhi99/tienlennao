-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "InvitationKind" AS ENUM ('DIRECT', 'LINK');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SeriesStatus" AS ENUM ('IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SeriesEndCondition" AS ENUM ('ROUNDS', 'TARGET_SCORE', 'MANUAL');

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "allowSpectators" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "roundNumber" INTEGER,
ADD COLUMN     "ruleSnapshot" JSONB,
ADD COLUMN     "seriesId" UUID;

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "roundNumber" INTEGER,
ADD COLUMN     "seriesId" UUID;

-- AlterTable
ALTER TABLE "match_players" ADD COLUMN     "cardsPlayed" INTEGER,
ADD COLUMN     "chopsMade" INTEGER,
ADD COLUMN     "chopsReceived" INTEGER,
ADD COLUMN     "penaltyPoints" INTEGER,
ADD COLUMN     "roundScore" INTEGER,
ADD COLUMN     "twosChopped" INTEGER,
ADD COLUMN     "twosLeft" INTEGER;

-- AlterTable
ALTER TABLE "match_events" ADD COLUMN     "stateVersion" INTEGER;

-- CreateTable
CREATE TABLE "room_spectators" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_spectators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_invitations" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "inviterId" UUID NOT NULL,
    "inviteeId" UUID,
    "kind" "InvitationKind" NOT NULL,
    "tokenHash" VARCHAR(64),
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_series" (
    "id" UUID NOT NULL,
    "hostId" UUID NOT NULL,
    "status" "SeriesStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "endCondition" "SeriesEndCondition" NOT NULL,
    "targetRounds" INTEGER,
    "targetScore" INTEGER,
    "ruleSnapshot" JSONB,
    "roundsPlayed" INTEGER NOT NULL DEFAULT 0,
    "winnerId" UUID,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_penalties" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "cards" TEXT[],
    "points" INTEGER NOT NULL,
    "rule" VARCHAR(64) NOT NULL,
    "explanation" VARCHAR(255) NOT NULL,
    "penaltyKey" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_penalties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_spectators_userId_idx" ON "room_spectators"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "room_spectators_roomId_userId_key" ON "room_spectators"("roomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "room_invitations_tokenHash_key" ON "room_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "room_invitations_inviteeId_status_idx" ON "room_invitations"("inviteeId", "status");

-- CreateIndex
CREATE INDEX "room_invitations_roomId_status_idx" ON "room_invitations"("roomId", "status");

-- CreateIndex
CREATE INDEX "game_series_status_createdAt_idx" ON "game_series"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "match_penalties_penaltyKey_key" ON "match_penalties"("penaltyKey");

-- CreateIndex
CREATE INDEX "match_penalties_matchId_idx" ON "match_penalties"("matchId");

-- CreateIndex
CREATE INDEX "match_penalties_userId_createdAt_idx" ON "match_penalties"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "rooms_seriesId_idx" ON "rooms"("seriesId");

-- CreateIndex
CREATE INDEX "matches_seriesId_idx" ON "matches"("seriesId");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "game_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_spectators" ADD CONSTRAINT "room_spectators_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_spectators" ADD CONSTRAINT "room_spectators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_invitations" ADD CONSTRAINT "room_invitations_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_invitations" ADD CONSTRAINT "room_invitations_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_invitations" ADD CONSTRAINT "room_invitations_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_series" ADD CONSTRAINT "game_series_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_series" ADD CONSTRAINT "game_series_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "game_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_penalties" ADD CONSTRAINT "match_penalties_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_penalties" ADD CONSTRAINT "match_penalties_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Hand-written: constraints Prisma cannot express ────────────────────────

-- Rooms may hold 2, 3 or 4 players (was exactly 4).
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_max_players_four";
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_max_players_range" CHECK ("maxPlayers" BETWEEN 2 AND 4);
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_round_number_positive" CHECK ("roundNumber" IS NULL OR "roundNumber" >= 1);
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_round_needs_series" CHECK (("seriesId" IS NULL) = ("roundNumber" IS NULL));
ALTER TABLE "matches" ADD CONSTRAINT "matches_round_needs_series" CHECK (("seriesId" IS NULL) = ("roundNumber" IS NULL));

ALTER TABLE "game_series" ADD CONSTRAINT "game_series_targets" CHECK (
  ("endCondition" = 'ROUNDS' AND "targetRounds" BETWEEN 1 AND 50 AND "targetScore" IS NULL) OR
  ("endCondition" = 'TARGET_SCORE' AND "targetScore" BETWEEN 1 AND 1000 AND "targetRounds" IS NULL) OR
  ("endCondition" = 'MANUAL' AND "targetRounds" IS NULL AND "targetScore" IS NULL)
);
ALTER TABLE "game_series" ADD CONSTRAINT "game_series_rounds_non_negative" CHECK ("roundsPlayed" >= 0);

-- A direct invitation names its invitee and has no token; a link has a token and no invitee.
ALTER TABLE "room_invitations" ADD CONSTRAINT "room_invitations_kind_shape" CHECK (
  ("kind" = 'DIRECT' AND "inviteeId" IS NOT NULL AND "tokenHash" IS NULL) OR
  ("kind" = 'LINK' AND "inviteeId" IS NULL AND "tokenHash" IS NOT NULL)
);
ALTER TABLE "room_invitations" ADD CONSTRAINT "room_invitations_use_count_non_negative" CHECK ("useCount" >= 0);

ALTER TABLE "match_penalties" ADD CONSTRAINT "match_penalties_points_non_negative" CHECK ("points" >= 0);
ALTER TABLE "match_penalties" ADD CONSTRAINT "match_penalties_seat_range" CHECK ("seatIndex" BETWEEN 0 AND 3);

ALTER TABLE "match_players" ADD CONSTRAINT "match_players_round_stats_non_negative" CHECK (
  COALESCE("penaltyPoints", 0) >= 0 AND COALESCE("cardsPlayed", 0) BETWEEN 0 AND 13 AND
  COALESCE("chopsMade", 0) >= 0 AND COALESCE("twosChopped", 0) >= 0 AND
  COALESCE("chopsReceived", 0) >= 0 AND COALESCE("twosLeft", 0) BETWEEN 0 AND 4
);

-- The match event log and the penalty records are append-only: once written, a row can never
-- be changed or removed (TRUNCATE, used only by the throwaway test databases, is unaffected).
CREATE FUNCTION "refuse_change_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "match_events_append_only" BEFORE UPDATE OR DELETE ON "match_events"
  FOR EACH ROW EXECUTE FUNCTION "refuse_change_append_only"();
CREATE TRIGGER "match_penalties_append_only" BEFORE UPDATE OR DELETE ON "match_penalties"
  FOR EACH ROW EXECUTE FUNCTION "refuse_change_append_only"();
