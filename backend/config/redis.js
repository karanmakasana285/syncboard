const { createClient } = require('redis');

const redisClient = createClient({
  url: 'redis://localhost:6379', // matches the port we exposed in docker-compose.yml
});

redisClient.on('error', (err) => console.error('Redis error:', err.message));

async function connectRedis() {
  await redisClient.connect();
  console.log('Redis connected');
}

module.exports = { redisClient, connectRedis };
