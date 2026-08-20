import { db } from './index';
import { seedCatalogs } from './seed-catalogs';
import { seedDemo } from './seed-demo';

/**
 * Seed: catálogos (sempre) + dados de exemplo (só se CIRCLE_SEED_DEMO=true, dev/hml).
 * Idempotente. Rodar via `pnpm db:seed`.
 */
async function main() {
   console.log('Seeding catalogs...');
   await seedCatalogs(db);
   console.log('Catalogs seeded.');

   if (process.env.CIRCLE_SEED_DEMO === 'true') {
      console.log('Seeding demo data (mock-data)...');
      await seedDemo(db);
      console.log('Demo data seeded.');
   }
   process.exit(0);
}

main().catch((err) => {
   console.error('Seed failed:', err);
   process.exit(1);
});
