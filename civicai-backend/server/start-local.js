/**
 * Local bootstrap: starts an in-memory MongoDB, then the Express API.
 * Use when a system MongoDB install is unavailable.
 */
const { MongoMemoryServer } = require('mongodb-memory-server');
const { spawn } = require('child_process');
const path = require('path');

async function main() {
  console.log('Starting in-memory MongoDB...');
  const mongod = await MongoMemoryServer.create({
    instance: { dbName: 'civicai' },
  });
  const uri = mongod.getUri('civicai');
  console.log(`MongoMemoryServer ready: ${uri}`);

  process.env.MONGODB_URI = uri;
  process.env.PORT = process.env.PORT || '5000';

  const serverPath = path.join(__dirname, 'server.js');
  const child = spawn(process.execPath, [serverPath], {
    cwd: __dirname,
    env: process.env,
    stdio: 'inherit',
  });

  const shutdown = async () => {
    console.log('\nShutting down...');
    child.kill('SIGTERM');
    await mongod.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  child.on('exit', async (code) => {
    await mongod.stop();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('Failed to start local stack:', err);
  process.exit(1);
});
