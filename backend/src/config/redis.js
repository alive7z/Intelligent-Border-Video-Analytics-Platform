const redis = require("redis");
const env = require("./env");

const client = redis.createClient({
  socket: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  },
});

client.on("error", (error) => {
  console.warn("Redis not connected yet:", error.message);
});

module.exports = {
  client,
  status: "pending-implementation",
  message:
    "Redis transient cache and queue layer will be finalized after architecture approval.",
};
