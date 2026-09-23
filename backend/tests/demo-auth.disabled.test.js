// Demo-access tests when DEMO_MODE=false (production-like). Forced off before
// the app/env are loaded so the result is independent of the local .env.
process.env.DEMO_MODE = "false";

const { test, after } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const app = require("../src/app");
const { closeDatabasePool } = require("../src/config/database");

after(async () => {
  await closeDatabasePool();
});

test("GET /api/auth/demo-access reports disabled when DEMO_MODE=false", async () => {
  const res = await request(app).get("/api/auth/demo-access");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.enabled, false);
});

test("POST /api/auth/demo-login rejects when DEMO_MODE=false", async () => {
  const res = await request(app)
    .post("/api/auth/demo-login")
    .send({ role: "ADMINISTRATOR" });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.message, "Demo access is not enabled");
  assert.strictEqual(res.body.data, null);
});