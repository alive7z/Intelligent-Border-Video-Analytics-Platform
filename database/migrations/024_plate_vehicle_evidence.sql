-- Add event-anchored evidence without removing existing evidence types/data.
ALTER TABLE evidence MODIFY COLUMN evidence_type ENUM('SNAPSHOT','INCIDENT_CLIP','FACE','PLATE','VEHICLE') NOT NULL;
