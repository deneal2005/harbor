// Reset the demo business to the sample ledger: DATABASE_URL=... DEMO_PASSWORD=... npm run db:seed-demo
import { seedDemo } from './api.js';
import { createPool, migrate } from './db.js';

if (!process.env.DATABASE_URL || !process.env.DEMO_PASSWORD) {
  console.error('Set DATABASE_URL and DEMO_PASSWORD.');
  process.exit(1);
}
const pool = createPool(process.env.DATABASE_URL);
await migrate(pool);
const { email } = await seedDemo(pool, { password: process.env.DEMO_PASSWORD });
console.log(`Demo business ready: ${email}`);
await pool.end();
