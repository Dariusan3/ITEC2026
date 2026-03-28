-- Migration 006: sessions
-- Replaces in-memory express-session with a Postgres-backed store
-- using connect-pg-simple. Sessions survive server restarts.

CREATE TABLE IF NOT EXISTS "session" (
  "sid"    VARCHAR     NOT NULL COLLATE "default",
  "sess"   JSON        NOT NULL,
  "expire" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON "session" (expire);
