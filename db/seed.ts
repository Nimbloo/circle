import { db } from './index';
import { seedCatalogs } from './seed-catalogs';

/** Seed de produção: catálogos (idempotente). Rodar via `pnpm db:seed`. */
async function main() {
   console.log('Seeding catalogs...');
   await seedCatalogs(db);
   console.log('Catalogs seeded.');
   process.exit(0);
}

main().catch((err) => {
   console.error('Seed failed:', err);
   process.exit(1);
});
