-- 029 — Permissonied-ledger evidence integrity + security hardening (additive).
-- Does not modify any frozen/operational table definition except users (adds
-- nullable security columns); no evidence bytes are ever stored here.

-- Evidence integrity ledger record (A2, B4, B7)
CREATE TABLE IF NOT EXISTS evidence_integrity (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  evidence_id BIGINT UNSIGNED NOT NULL,
  sha256_hash CHAR(64) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type VARCHAR(120) NULL,
  hash_algorithm VARCHAR(32) NOT NULL DEFAULT 'SHA-256',
  signature TEXT NULL,
  signature_algorithm VARCHAR(64) NULL DEFAULT 'Ed25519',
  signing_key_id VARCHAR(80) NULL,
  public_key_pem TEXT NULL,
  ledger_tx_hash CHAR(128) NULL,
  ledger_block_number BIGINT NULL,
  ledger_network VARCHAR(64) NULL,
  ledger_status ENUM('PENDING_ANCHOR','ANCHORED','FAILED') NOT NULL DEFAULT 'PENDING_ANCHOR',
  ledger_attempts INT NOT NULL DEFAULT 0,
  ledger_error VARCHAR(500) NULL,
  anchored_at DATETIME NULL,
  encryption_key_id VARCHAR(64) NULL,
  encryption_enabled TINYINT(1) NOT NULL DEFAULT 0,
  provenance_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_evidence_integrity_evidence (evidence_id),
  KEY idx_integrity_ledger_status (ledger_status),
  CONSTRAINT fk_integrity_evidence FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only chain of custody (A9)
CREATE TABLE IF NOT EXISTS chain_of_custody (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  evidence_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(40) NOT NULL,
  actor_user_id BIGINT NULL,
  actor_role VARCHAR(32) NULL,
  occurred_at VARCHAR(40) NOT NULL,
  previous_record_hash CHAR(64) NOT NULL,
  record_hash CHAR(64) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_custody_evidence (evidence_id, id),
  CONSTRAINT fk_custody_evidence FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit-log batch anchors (A10/A11)
CREATE TABLE IF NOT EXISTS audit_anchor_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_key VARCHAR(64) NOT NULL,
  first_audit_id BIGINT NOT NULL,
  last_audit_id BIGINT NOT NULL,
  record_count BIGINT NOT NULL,
  merkle_root CHAR(64) NOT NULL,
  merkle_leaves_sha256 JSON NULL,
  ledger_tx_hash CHAR(128) NULL,
  ledger_block_number BIGINT NULL,
  status ENUM('PENDING_ANCHOR','ANCHORED','FAILED') NOT NULL DEFAULT 'PENDING_ANCHOR',
  anchored_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_audit_batch_key (batch_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Token revocation (B10)
CREATE TABLE IF NOT EXISTS token_revocations (
  jti VARCHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  reason VARCHAR(64) NULL,
  revoked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (jti),
  KEY idx_revocations_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Administrative MFA enrolment log (B3)
CREATE TABLE IF NOT EXISTS mfa_enrolments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  key_id VARCHAR(64) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mfa_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Single-use recovery codes (hashed) (B3)
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  code_hash CHAR(64) NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recovery_hash (code_hash),
  KEY idx_recovery_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Users: additive nullable security columns (B3, B8/B9, B10). MySQL 8.x does
-- not support "ADD COLUMN IF NOT EXISTS"; migration 029 runs exactly once via
-- schema_migrations, so plain ADD COLUMN is correct.
ALTER TABLE users
  ADD COLUMN mfa_secret_enc TEXT NULL,
  ADD COLUMN mfa_key_id VARCHAR(64) NULL,
  ADD COLUMN mfa_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN token_version INT NOT NULL DEFAULT 0,
  ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN locked_until DATETIME NULL;