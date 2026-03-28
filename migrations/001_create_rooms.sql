-- Migration 001: rooms
-- Each room maps to a URL hash session (e.g. itecify.app/#abc123)

CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT        PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_last_active ON rooms (last_active);
