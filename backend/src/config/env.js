const dotenv = require("dotenv");

dotenv.config({ path: process.env.ENV_FILE || ".env" });

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 3001),
  JWT_SECRET: process.env.JWT_SECRET || "development-secret",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),
  DB_HOST: process.env.DB_HOST || "localhost",
  DB_PORT: Number(process.env.DB_PORT || 5432),
  DB_NAME: process.env.DB_NAME || "ibvap",
  DB_USER: process.env.DB_USER || "ibvap",
  DB_PASSWORD: process.env.DB_PASSWORD || "change-me",
};

module.exports = env;
