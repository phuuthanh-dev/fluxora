-- A persisted palette key gives the initials avatar a stable appearance across sessions.
ALTER TABLE "User" ADD COLUMN "avatarColor" TEXT NOT NULL DEFAULT 'lime';
