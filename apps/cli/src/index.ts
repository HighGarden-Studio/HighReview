#!/usr/bin/env node
import 'dotenv/config';
import { startServer } from './server.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8765;

async function main() {
  try {
    console.log('🚀 Starting HighReview server...');
    await startServer(PORT);
    console.log(`✓ Server running at http://localhost:${PORT}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
