-- Migration 004: chat_messages
-- Persists room chat so history loads when a new user joins.

CREATE TABLE IF NOT EXISTS chat_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      TEXT        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  author       TEXT        NOT NULL,
  author_color TEXT        NOT NULL DEFAULT '#cba6f7',
  text         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages (room_id, created_at);
