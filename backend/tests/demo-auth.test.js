// Demo-access integration tests (DEMO_MODE=true).
// Runs in its own process; DEMO_MODE is forced on before the app/env are
// loaded so the result is independent of the developer's local .env.
process.env.DEMO_MODE = "true";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const request = require("supertest");
const app = require("../src/app");
const { getPool, closeDatabasePool } = require("../src/config/database");
const { hashPassword } = require("../src/utils/password");

const DEMO_OPERATOR = "demo.auth.operator@ibvap.local";
const DEMO_PWD = "DemoAuth#Operator2026!";

let pool;
let demoOperatorId;

const createDemoUser = async ({ email, password, role }) => {
  const [result] = await pool.execute(
    `INSERT INTO users (public_id, full_name, email, password_hash, role, status, is_demo)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1)`,
    [crypto.randomUUID(), "Demo Auth Test User", email, await hashPassword(password), role]
  );
  return result.insertId;
};

before(async () => {
  pool = getPool();
  demoOperatorId = await createDemoUser({ email: DEMO_OPERATOR, password: DEMO_PWD, role: "SECURITY_OPERATOR" });
});

after(async () => {
  if (demoOperatorId) {
    await pool.execute("DELETE FROM users WHERE id = ?", [demoOperatorId]);
  }
  await closeDatabasePool();
});

const demoLogin = async (role) => request(app).post("/api/auth/demo-login").send({ role });

test("GET /api/auth/demo-access reports enabled when DEMO_MODE=true", async () => {
  const res = await request(app).get("/api/auth/demo-access");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.enabled, true);
});

test("POST /api/auth/demo-login ADMINISTRATOR returns a real admin session", async () => {
  const res = await demoLogin("ADMINISTRATOR");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.data.accessToken);
  assert.strictEqual(res.body.data.tokenType, "Bearer");
  assert.strictEqual(res.body.data.user.role, "ADMINISTRATOR");
});

test("POST /api/auth/demo-login SECURITY_OPERATOR returns a real operator session", async () => {
  const res = await demoLogin("SECURITY_OPERATOR");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.data.accessToken);
  assert.strictEqual(res.body.data.user.role, "SECURITY_OPERATOR");
});

test("demo-login never exposes stored credentials or internals", async () => {
  const res = await demoLogin("ADMINISTRATOR");
  const bodyText = JSON.stringify(res.body);
  assert.strictEqual(bodyText.includes("password"), false);
  assert.strictEqual(bodyText.includes("password_hash"), false);
  assert.strictEqual(bodyText.includes("mfa_secret"), false);
  assert.strictEqual(bodyText.includes("token_version"), false);
  assert.strictEqual(res.body.data.user.id, undefined);
});

test("demo-login token works with /auth/me (normal session restore)", async () => {
  const login = await demoLogin("SECURITY_OPERATOR");
  const token = login.body.data.accessToken;
  const me = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.data.user.role, "SECURITY_OPERATOR");
});

test("demo-login honors real RBAC (operator is denied admin routes)", async () => {
  const login = await demoLogin("SECURITY_OPERATOR");
  const token = login.body.data.accessToken;

  const express = require("express");
  const { authenticate } = require("../src/middleware/auth.middleware");
  const { authorizeRoles } = require("../src/middleware/role.middleware");
  const errorHandler = require("../src/middleware/error.middleware");
  const testApp = express();
  testApp.get(
    "/admin-probe",
    authenticate,
    authorizeRoles("ADMINISTRATOR"),
    (req, res) => res.status(200).json({ ok: true })
  );
  testApp.use(errorHandler);

  const probe = await request(testApp)
    .get("/admin-probe")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(probe.status, 403);
  assert.strictEqual(probe.body.message, "Insufficient role permissions");
});

test("demo-login rejects roles outside the whitelist", async () => {
  const auditor = await demoLogin("AUDITOR_ANALYST");
  assert.strictEqual(auditor.status, 400);
  assert.match(auditor.body.message, /invalid demo role/i);

  const garbage = await demoLogin("SUPER_ADMIN");
  assert.strictEqual(garbage.status, 400);
  assert.match(garbage.body.message, /invalid demo role/i);
});

test("demo-login requires a known role", async () => {
  const missing = await request(app).post("/api/auth/demo-login").send({});
  assert.strictEqual(missing.status, 400);
});