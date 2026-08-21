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
   // Advisory lock serializa migrate/seed entre pods concorrentes num rollout
   // (o event bus é desenhado p/ multi-réplica). Sem ele, dois `migrate()` sobre schema
   // desatualizado colidem (CREATE/ALTER duplicado) e um pod quebra no boot. O lock é
   // por-conexão (session-level), então vive numa conexão DEDICADA segurada por todo o
   // migrate — não no pool (statement_timeout=15s mataria a espera). Contendores esperam
   // o líder terminar e, como o migrate é idempotente, seguem como no-op.
   const { Client } = await import('pg');
   const LOCK_KEY = 4210771; // "circle" — constante estável, qualquer int64 serve
   const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
   try {
      const { migrate } = await import('drizzle-orm/node-postgres/migrator');
      const { getDb } = await import('@/db');
      const { seedCatalogs } = await import('@/db/seed-catalogs');
      await lockClient.connect();
      await lockClient.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
      try {
         await migrate(getDb(), { migrationsFolder: './db/migrations' });
         await seedCatalogs(getDb());
      } finally {
         await lockClient.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
      }
      console.log('[circle] migrations aplicadas + catálogos semeados');
   } catch (err) {
      // Fail-fast: migration/seed quebrado NÃO deve subir o pod como "verde".
      // Rethrow derruba o boot -> com a readinessProbe no /api/readyz (que toca o
      // DB), o rollout trava e o pod antigo segue servindo (sem deploy silencioso).
      console.error('[circle] falha ao migrar/semear no boot:', err);
      throw err;
   } finally {
      // Encerra a conexão dedicada do lock (libera o advisory lock junto, se ainda ativo).
      await lockClient.end().catch(() => {});
   }
}
