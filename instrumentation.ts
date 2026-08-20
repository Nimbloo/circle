/**
 * Hook de startup do Next.js: aplica as migrations e semeia os catálogos no boot
 * (idempotente; drizzle rastreia migrations aplicadas). A imagem standalone tem
 * drizzle-orm + pg (deps de prod) — não precisa de drizzle-kit/tsx em runtime.
 * Seed demo NÃO roda aqui (só via `pnpm db:seed` com CIRCLE_SEED_DEMO em dev/hml).
 */
export async function register() {
   if (process.env.NEXT_RUNTIME !== 'nodejs') return;
   if (process.env.CIRCLE_SKIP_MIGRATE === 'true') return;
   if (!process.env.DATABASE_URL) {
      console.warn('[circle] DATABASE_URL ausente — pulando migrations no boot');
      return;
   }
   try {
      const { migrate } = await import('drizzle-orm/node-postgres/migrator');
      const { getDb } = await import('@/db');
      const { seedCatalogs } = await import('@/db/seed-catalogs');
      await migrate(getDb(), { migrationsFolder: './db/migrations' });
      await seedCatalogs(getDb());
      console.log('[circle] migrations aplicadas + catálogos semeados');
   } catch (err) {
      console.error('[circle] falha ao migrar/semear no boot:', err);
   }
}
