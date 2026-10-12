const Redis = require('ioredis');

let client;
function getRedis() {
  if (!client) {
    client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 3 });
    client.on('error', (e) => console.error('[redis]', e.message));
  }
  return client;
}

module.exports = { getRedis };
