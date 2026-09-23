-- Secure demo access for SIH/exhibition walkthroughs.
-- Marks dedicated demo accounts so /auth/demo-login can select them by role
-- without any hardcoded credentials. The is_demo flag is the only marker; the
-- demo-login endpoint is further gated by DEMO_MODE (production defaults off).
ALTER TABLE users ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 AFTER mfa_enabled;

UPDATE users
SET is_demo = 1, status = 'ACTIVE'
WHERE email IN ('admin@ibvap.demo', 'operator@ibvap.demo', 'analyst@ibvap.demo');