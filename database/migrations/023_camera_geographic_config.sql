-- idempotent-duplicate-ok
-- Optional operator-configured geographic data and neighboring camera codes.
-- Existing cameras retain NULL: no locations or relationships are invented.
ALTER TABLE cameras ADD COLUMN geographic_config JSON NULL;
