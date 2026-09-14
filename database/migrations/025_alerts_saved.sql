-- 025_alerts_saved.sql
-- Saved Alerts: an explicit operator bookmark that survives normal retention
-- cleanup. "Saved" is a distinct state from "Protected": saving an alert
-- bookmarks it AND ensures its incident (anchor event) is protected from
-- retention. protection_source records who created each protection so unsaving
-- only removes protection created specifically by SAVE, never manual or system
-- protection that already existed.
ALTER TABLE alerts
  ADD COLUMN protection_source VARCHAR(32) NULL AFTER protected_at,
  ADD COLUMN is_saved TINYINT(1) NOT NULL DEFAULT 0 AFTER protection_source,
  ADD COLUMN saved_by BIGINT UNSIGNED NULL AFTER is_saved,
  ADD COLUMN saved_at DATETIME NULL AFTER saved_by,
  ADD KEY idx_alerts_is_saved (is_saved),
  ADD KEY idx_alerts_protection_source (protection_source);