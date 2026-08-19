import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/** Instância única do Drizzle (node-postgres) para os route handlers em produção. */
const globalForDb = globalThis as unknown as { __circlePool?: Pool };

const pool =
   globalForDb.__circlePool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

if (process.env.NODE_ENV !== 'production') {
   globalForDb.__circlePool = pool;
}

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });
export type Db = NodePgDatabase<typeof schema>;
export { schema };
