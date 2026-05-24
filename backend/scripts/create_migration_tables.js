import dotenv from 'dotenv';
dotenv.config();
import { ensureMigrationTablesForYear } from '../models/migration2025Model.js';

async function main() {
  const args = process.argv.slice(2);
  const years = args.length ? args.map((a) => Number(a)).filter((y) => Number.isFinite(y)) : [2025];
  console.log('Creating migration tables for years:', years.join(', '));
  for (const y of years) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await ensureMigrationTablesForYear(y);
      console.log(`✅ ensured migration tables for ${y}`);
    } catch (err) {
      console.error(`❌ failed ensuring tables for ${y}:`, err.message || err);
    }
  }
  process.exit(0);
}

void main();
