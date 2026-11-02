-- CreateTable
CREATE TABLE "avatar_images" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avatar_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avatar_images_userId_idx" ON "avatar_images"("userId");

-- AddForeignKey
ALTER TABLE "avatar_images" ADD CONSTRAINT "avatar_images_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Uploaded avatars used to be files on the API's disk, which the new storage cannot serve (and
-- which free hosts had already wiped). Clear those references; external URLs are kept.
UPDATE "user_profiles" SET "avatarUrl" = NULL WHERE "avatarUrl" !~ '^https?://';
