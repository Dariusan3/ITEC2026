-- Migration 007: cleanup policy
-- Auto-deletes rooms (and their files/chat/runs via CASCADE)
-- that have been inactive for more than 30 days.
-- Schedule with pg_cron (available on Supabase) or a server-side cron job.

CREATE OR REPLACE FUNCTION cleanup_old_rooms()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM rooms WHERE last_active < NOW() - INTERVAL '30 days';
END;
$$;

-- Uncomment to schedule via pg_cron on Supabase:
-- SELECT cron.schedule('cleanup-old-rooms', '0 3 * * *', 'SELECT cleanup_old_rooms()');
