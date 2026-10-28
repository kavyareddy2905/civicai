/**
 * Dev bootstrap: starts an in-memory MongoDB if local mongod is unavailable,
 * then launches the Express API.
 */
require('dotenv').config();

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/civicai';
  let useMemory = process.env.USE_MEMORY_DB === '1';

  if (!useMemory) {
    try {
      const net = require('net');
      await new Promise((resolve, reject) => {
        const socket = net.connect(27017, '127.0.0.1');
        socket.setTimeout(1500);
        socket.on('connect', () => {
          socket.end();
          resolve();
        });
        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('timeout'));
        });
        socket.on('error', reject);
      });
      console.log('Local MongoDB detected on :27017');
    } catch {
      useMemory = true;
      console.warn('Local MongoDB not reachable — starting mongodb-memory-server…');
    }
  }

  if (useMemory) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create({
      instance: { dbName: 'civicai' },
    });
    process.env.MONGODB_URI = mongod.getUri('civicai');
    console.log(`In-memory MongoDB ready: ${process.env.MONGODB_URI}`);

    const shutdown = async () => {
      await mongod.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  require('./server');
}

main().catch((err) => {
  console.error('Failed to start CivicAI server:', err);
  process.exit(1);
});
