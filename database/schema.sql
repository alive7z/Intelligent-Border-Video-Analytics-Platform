-- IBVAP database schema placeholder
-- This file is intentionally not a complete schema.
-- The final SQL model will be designed after architecture approval.

-- Planned entities:
-- users
-- cameras
-- zones
-- tracks
-- events
-- alerts
-- plates
-- evidence_metadata
-- audit_logs
-- system_health

-- Example structure kept intentionally minimal until implementation begins.
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
