import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';

/**
 * Migrations rodam no boot, idempotentes, com advisory lock entre pods (AGENTS.md) — mas
 * 0050/0051 tinham `CREATE TABLE`/`ADD COLUMN`/`CREATE INDEX`/`ADD CONSTRAINT` sem guarda,
 * que falham (42P07/42701/42710) se reaplicados. Roda o SQL das duas migrations DUAS vezes
 * sobre um banco já totalmente migrado (mesmo efeito de um rerun) e confirma que não lança.
 */
function statements(file: string): string[] {
   const sql = readFileSync(path.join(__dirname, '..', 'db', 'migrations', file), 'utf8');
   return sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
}

describe('migrations 0050/0051 — idempotentes (rerun seguro)', () => {
   it('rodar o SQL da 0050 e da 0051 duas vezes não falha', async () => {
      const client = new PGlite();
      const db = drizzle(client, { schema });
      await migrate(db, { migrationsFolder: './db/migrations' });

      const sqls = [
         ...statements('0050_wealthy_sway.sql'),
         ...statements('0051_label_group_document_body.sql'),
      ];

      // 1ª aplicação: já rodou via `migrate()` acima. 2ª e 3ª: reaplica manualmente —
      // é o cenário real (dois pods competindo, ou o boot rodando de novo).
      for (let round = 0; round < 2; round++) {
         for (const stmt of sqls) {
            await client.exec(stmt);
         }
      }

      await client.close();
   });
});
