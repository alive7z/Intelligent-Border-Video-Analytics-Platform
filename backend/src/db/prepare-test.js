// Minimal fixtures required by legacy integration tests, never operational data.
const fs = require("fs");
const path = require("path");
const env = require("../config/env");
const { getPool, closeDatabasePool } = require("../config/database");
const logger = require("../utils/logger");

async function run() {
  if (env.NODE_ENV !== "test" || !/(^|_)test($|_)/i.test(env.DB.NAME)) {
    throw new Error("Test fixtures require NODE_ENV=test and an explicitly named test database");
  }
  const pool = getPool();
  await pool.execute(
    "INSERT IGNORE INTO cameras (camera_code, name, source_type, enabled) VALUES ('CAM-01', 'Isolated test fixture', 'VIDEO_FILE', 0)"
  );
  const seed = fs.readFileSync(path.resolve(__dirname, "../../../database/seeds/demo_seed.sql"), "utf8");
  const rules = seed.match(/INSERT IGNORE INTO risk_rules[\s\S]*?;/);
  if (!rules) throw new Error("Test rule definitions unavailable");
  await pool.query(rules[0]);
  logger.info("Isolated test fixtures prepared; no operational observations seeded");
}

run().catch((error) => { logger.error(error.message); process.exitCode = 1; }).finally(closeDatabasePool);
