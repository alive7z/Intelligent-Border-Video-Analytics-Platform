"use strict";

const { getPool } = require("../config/database");

// MFA (TOTP) + recovery-code persistence. Recovery codes are stored hashed and
// single-use (B3). All queries parameterized.

const insertRecoveryCodes = async ({ userId, codeHashes }) => {
  for (const hash of codeHashes) {
    await getPool().execute(
      "INSERT IGNORE INTO mfa_recovery_codes (user_id, code_hash) VALUES (?, ?)",
      [userId, hash]
    );
  }
};

const findRecoveryCode = async (codeHash, userId) => {
  const [rows] = await getPool().execute(
    "SELECT id, user_id FROM mfa_recovery_codes WHERE code_hash = ? AND used_at IS NULL LIMIT 1",
    [codeHash]
  );
  return rows[0] || null;
};

const consumeRecoveryCode = async (id) => {
  await getPool().execute(
    "UPDATE mfa_recovery_codes SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL",
    [id]
  );
};

const listUnusedRecoveryCodesCount = async (userId) => {
  const [rows] = await getPool().execute(
    "SELECT COUNT(*) AS n FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL",
    [userId]
  );
  return rows[0].n;
};

const markRecoveryCodesUsedForUser = async (userId) => {
  await getPool().execute(
    "UPDATE mfa_recovery_codes SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL",
    [userId]
  );
};

module.exports = {
  insertRecoveryCodes, findRecoveryCode, consumeRecoveryCode,
  listUnusedRecoveryCodesCount, markRecoveryCodesUsedForUser,
};