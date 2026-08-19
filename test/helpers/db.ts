import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import type { Db } from '@/db';
import { seedCatalogs } from '@/db/seed-catalogs';

/**
 * Postgres embutido (PGlite/WASM) para testes: aplica as migrations reais do
 * Drizzle e semeia os catálogos. Sem Docker, in-process.
 */
export async function makeTestDb(withCatalogs = true): Promise<Db> {
   const client = new PGlite();
   const db = drizzle(client, { schema }) as unknown as Db;
   await migrate(db, { migrationsFolder: './db/migrations' });
   if (withCatalogs) {
      await seedCatalogs(db);
   }
   return db;
}
