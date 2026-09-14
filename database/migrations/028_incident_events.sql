-- One persisted row owns a live restricted-zone vehicle intrusion. The key is
-- camera/session/track scoped; NULL keeps historical/non-incident events intact.
ALTER TABLE events
  ADD COLUMN incident_key VARCHAR(255) NULL AFTER event_code,
  ADD UNIQUE KEY uq_events_incident_key (incident_key);
