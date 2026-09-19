import { sql } from 'drizzle-orm';
import type { Db } from '@/db';

/**
 * A tabela `import_job` (#10) é declarada em `db/schema.ts` pela frente F4, mas a
 * migration é gerada pelo integrador (frente F5a). Enquanto ela não existir em
 * `db/migrations/`, os testes criam a tabela aqui com o MESMO formato do schema.
 * `IF NOT EXISTS` torna isto inofensivo depois que a migration chegar.
 */
export async function ensureImportJobTable(db: Db): Promise<void> {
   await db.execute(sql`
      CREATE TABLE IF NOT EXISTS import_job (
         id varchar(36) PRIMARY KEY,
         owner_id varchar(36) NOT NULL REFERENCES app_user(id),
         team_id varchar(16) NOT NULL REFERENCES team(id) ON DELETE CASCADE,
         source varchar(32) NOT NULL,
         status varchar(16) NOT NULL,
         total integer NOT NULL DEFAULT 0,
         processed integer NOT NULL DEFAULT 0,
         created integer NOT NULL DEFAULT 0,
         updated integer NOT NULL DEFAULT 0,
         skipped integer NOT NULL DEFAULT 0,
         errors jsonb NOT NULL DEFAULT '[]'::jsonb,
         error text,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now(),
         finished_at timestamptz
      )
   `);
   await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_import_job_owner ON import_job (owner_id, created_at)`
   );
}
