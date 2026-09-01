import { seedCatalogs } from './seed-catalogs';
import { seedDemo } from './seed-demo';
import { loadLocalDatabaseEnv } from './load-local-env';

loadLocalDatabaseEnv();

/**
 * Seed: catálogos (sempre) + dados de exemplo (só se CIRCLE_SEED_DEMO=true, dev/hml).
 * Idempotente. Rodar via `pnpm db:seed`.
 */
async function main() {
   const { db } = await import('./index');

   console.log('Seeding catalogs...');
   await seedCatalogs(db);
   console.log('Catalogs seeded.');

   if (process.env.CIRCLE_SEED_DEMO === 'true') {
      console.log('Seeding demo data (mock-data)...');
      // O log segue o que REALMENTE aconteceu: o mock-data vem zerado por padrao
      // (o app e API-driven), e anunciar sucesso sem inserir nada e enganoso.
      const seeded = await seedDemo(db);
      console.log(
         seeded
            ? 'Demo data seeded.'
            : 'Demo data: nada a semear (mock-data vazio em `data/`) — nenhuma linha inserida.'
      );
   }
   process.exit(0);
}

main().catch((err) => {
   console.error('Seed failed:', err);
   process.exit(1);
});
