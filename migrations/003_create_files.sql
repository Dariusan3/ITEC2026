-- Migration 003: files
-- One row per file per room. Upserted every ~3s during active editing.
-- content = full file text (Yjs plain text snapshot).

CREATE TABLE IF NOT EXISTS files (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    TEXT        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  filename   TEXT        NOT NULL,
  language   TEXT        NOT NULL DEFAULT 'javascript',
  content    TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT files_room_filename UNIQUE (room_id, filename)
);

CREATE INDEX IF NOT EXISTS idx_files_room ON files (room_id);
