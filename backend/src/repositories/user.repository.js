const { getPool } = require("../config/database");
const env = require("../config/env");

const findUserByEmail = async (email) => {
  const [rows] = await getPool().execute(
    "SELECT id, public_id, full_name, email, password_hash, role, status, last_login_at, mfa_secret_enc, mfa_key_id, mfa_enabled, token_version, failed_login_attempts, locked_until, created_at, updated_at FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  return rows[0] || null;
};

const findUserById = async (id, conn) => {
  const [rows] = await (conn || getPool()).execute(
    "SELECT id, public_id, full_name, email, password_hash, role, status, last_login_at, mfa_secret_enc, mfa_key_id, mfa_enabled, token_version, failed_login_attempts, locked_until, created_at, updated_at FROM users WHERE id = ? LIMIT 1",
    [id]
  );
  return rows[0] || null;
};

const findUserByPublicId = async (publicId) => {
  const [rows] = await getPool().execute(
    "SELECT id, public_id, full_name, email, password_hash, role, status, last_login_at, mfa_secret_enc, mfa_key_id, mfa_enabled, token_version, failed_login_attempts, locked_until, created_at, updated_at FROM users WHERE public_id = ? LIMIT 1",
    [publicId]
  );
  return rows[0] || null;
};

const recordFailedAttempt = async ({ userId, email, attempts, lockedUntil }) => {
  // Lock an account (progressive delay) without requiring the row to exist.
  if (userId) {
    await getPool().execute(
      "UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?",
      [attempts, lockedUntil ? lockedUntil.toISOString().slice(0, 19).replace("T", " ") : null, userId]
    );
    return;
  }
  // Unknown email: no row to mutate; the caller already audits the failure.
};

const clearFailedAttempts = async (userId) => {
  await getPool().execute(
    "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
    [userId]
  );
};

const saveMfa = async ({ userId, secretEnc, keyId, enabled }) => {
  await getPool().execute(
    "UPDATE users SET mfa_secret_enc = ?, mfa_key_id = ?, mfa_enabled = ? WHERE id = ?",
    [secretEnc, keyId, enabled ? 1 : 0, userId]
  );
};

const bumpTokenVersion = async (userId, conn) => {
  const executor = conn || getPool();
  await executor.execute("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [userId]);
  return Number((await executor.query("SELECT token_version FROM users WHERE id = ?", [userId]))[0][0].token_version);
};

const updateLastLogin = async (userId) => {
  await getPool().execute(
    "UPDATE users SET last_login_at = UTC_TIMESTAMP(), failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
    [userId]
  );
};

const updateFullName = async (userId, fullName) => {
  const transaction = typeof userId === "object" ? userId.conn : null;
  const executor = transaction || getPool();
  const id = typeof userId === "object" ? userId.userId : userId;
  await executor.execute("UPDATE users SET full_name = ? WHERE id = ?", [fullName, id]);
  return findUserById(id, transaction);
};

const auditInsert = async ({
  userId,
  action,
  entityType = null,
  entityId = null,
  details = null,
  ipAddress = null,
}) => {
  await getPool().execute(
    `INSERT INTO audit_logs (user_id, actor_role, action, entity_type, entity_id, details_json, ip_address)
     VALUES (?, (SELECT role FROM users WHERE id = ?), ?, ?, ?, ?, ?)`,
    [
      userId ?? null,
      userId ?? null,
      action,
      entityType,
      entityId,
      details ? JSON.stringify(details) : null,
      ipAddress,
    ]
  );
  await getPool().execute(
    `DELETE FROM audit_logs
      WHERE id IN (
        SELECT id FROM (
          SELECT id FROM audit_logs ORDER BY id DESC
          LIMIT 18446744073709551615 OFFSET ?
        ) oldest
      )`,
    [env.AUDIT_LOG_MAX_ROWS]
  );
};

const createUser = async ({ publicId, fullName, email, passwordHash, role, status }, conn) => {
  const [result] = await (conn || getPool()).execute(
    `INSERT INTO users (public_id, full_name, email, password_hash, role, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [publicId, fullName, email, passwordHash, role, status]
  );
  return result.insertId;
};

const beginTransaction = async () => {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  return conn;
};

module.exports = {
  findUserByEmail,
  findUserById,
  findUserByPublicId,
  updateLastLogin,
  updateFullName,
  auditInsert,
  createUser,
  beginTransaction,
  recordFailedAttempt,
  clearFailedAttempts,
  saveMfa,
  bumpTokenVersion,
};
