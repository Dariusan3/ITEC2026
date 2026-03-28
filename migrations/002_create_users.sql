-- Migration 002: users
-- GitHub OAuth users. ID = GitHub user ID (stable, never changes).

CREATE TABLE IF NOT EXISTS users (
  id         BIGINT      PRIMARY KEY,
  login      TEXT        NOT NULL,
  name       TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
