-- 026_events_protection_source.sql
-- Source of each event's protection (MANUAL / SAVED_ALERT). Saving an alert
-- may protect its anchor event; the source lets an unsave remove only that
-- SAVE-created protection and never manual/system protection.
ALTER TABLE events
  ADD COLUMN protection_source VARCHAR(32) NULL AFTER protected_at,
  ADD KEY idx_events_protection_source (protection_source);