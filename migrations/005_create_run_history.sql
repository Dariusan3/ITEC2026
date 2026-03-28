-- Migration 005: run_history
-- Replaces localStorage-only run history with a shared, room-scoped log.

CREATE TABLE IF NOT EXISTS run_history (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    TEXT        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_login TEXT,
  language   TEXT        NOT NULL,
  exit_code  INTEGER,
  has_error  BOOLEAN     NOT NULL DEFAULT FALSE,
  preview    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_history_room ON run_history (room_id, created_at DESC);
