const env = require("./env");

module.exports = {
  connection: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  },
  status: "pending-implementation",
  message:
    "SQL database adapter and ORM layer will be configured after final architecture approval.",
};
