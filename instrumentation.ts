import * as Sentry from '@sentry/nextjs';

/**
 * Hook de startup do Next.js: inicializa o Sentry do runtime correspondente e, no
 * Node, aplica as migrations e semeia os catálogos no boot (idempotente; drizzle
 * rastreia migrations aplicadas). A imagem standalone tem drizzle-orm + pg (deps de
 * prod) — não precisa de drizzle-kit/tsx em runtime.
 * Seed demo NÃO roda aqui (só via `pnpm db:seed` com CIRCLE_SEED_DEMO em dev/hml).
 */
export async function register() {
   // Antes de qualquer early return abaixo: sem isto o Sentry do server só ligaria
   // quando as migrations rodassem, e o do Edge nunca ligaria.
   if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
   if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config');

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
   const fs = await import('node:fs');
   const path = await import('node:path');
   const LOCK_KEY = 4210771; // "circle" — constante estável, qualquer int64 serve
   const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
   // Path ABSOLUTO (defensivo): `./db/migrations` dependia da cwd; em Next standalone o
   // migrate no boot já pulou uma migration silenciosamente (ver [[circle-deploy]] gotcha).
   const migrationsFolder = path.resolve(process.cwd(), 'db/migrations');
   try {
      const { migrate } = await import('drizzle-orm/node-postgres/migrator');
      const { getDb } = await import('@/db');
      const { seedCatalogs } = await import('@/db/seed-catalogs');
      await lockClient.connect();
      await lockClient.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
      try {
         // Quantas migrations existem no disco (journal) — pra detectar no-op suspeito.
         const journal = JSON.parse(
            fs.readFileSync(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8')
         );
         const onDisk = Array.isArray(journal.entries) ? journal.entries.length : 0;

         await migrate(getDb(), { migrationsFolder });
         await seedCatalogs(getDb());

         const applied = (
            await lockClient.query('SELECT count(*)::int AS c FROM drizzle.__drizzle_migrations')
         ).rows[0].c as number;
         console.log(
            `[circle] migrate: disco=${onDisk} aplicadas=${applied} (folder=${migrationsFolder})`
         );
         // FAIL-FAST: se sobrou migration no disco não aplicada, o migrate no boot falhou
         // (bug do standalone) — NÃO subir com schema drift. Aplique manualmente (memória).
         if (applied < onDisk) {
            throw new Error(
               `migrate no-op suspeito: aplicadas=${applied} < disco=${onDisk} (schema drift). ` +
                  `Aplique a migration manualmente — ver [[circle-deploy]].`
            );
         }
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

   // Webhooks de saída (#101): retenta no boot as entregas que ficaram pendentes do
   // processo anterior. Lazy, sem CronJob; o próprio sweep pega um advisory lock, então
   // subir várias réplicas não duplica entrega. Best-effort — não derruba o pod.
   void (async () => {
      try {
         const { getDb } = await import('@/db');
         const { sweepWebhookDeliveries } = await import('@/lib/api/webhooks');
         const tried = await sweepWebhookDeliveries(getDb());
         if (tried > 0) console.log(`[circle] webhooks: ${tried} entrega(s) retentada(s) no boot`);
      } catch (e) {
         console.warn('[circle] sweep de webhooks no boot falhou:', (e as Error).message);
      }
   })();
}

/**
 * Captura erros de renderização/handler do servidor (App Router, Next 15+) — o que
 * o `register()` sozinho não vê.
 */
export const onRequestError = Sentry.captureRequestError;
