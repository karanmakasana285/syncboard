const { createClient } = require('redis');

// REDIS_URL is set on the deployment platform (Render) to the Upstash
// rediss:// connection string. Locally, it falls back to our Docker Compose
// Redis container. node-redis automatically enables TLS when it sees the
// rediss:// scheme, so no extra config is needed for the Upstash case.
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => console.error('Redis error:', err.message));

async function connectRedis() {
  await redisClient.connect();
  console.log('Redis connected');
}

module.exports = { redisClient, connectRedis };
