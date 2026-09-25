import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

/**
 * Migration 0055 (chave do `issue_import` por time) sobre dados existentes: banco até a
 * 0054 com rastros de import, e então a 0055 — DUAS vezes (idempotente).
 */
const MIGRATION = readdirSync('db/migrations').find((f) => f.startsWith('0055_'))!;
const tmp = mkdtempSync(join(tmpdir(), 'circle-mig55-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function migrationsUpTo0054(): string {
   cpSync('db/migrations', tmp, { recursive: true });
   rmSync(join(tmp, MIGRATION));
   const journalPath = join(tmp, 'meta', '_journal.json');
   const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
   journal.entries = journal.entries.filter((e: { idx: number }) => e.idx < 55);
   writeFileSync(journalPath, JSON.stringify(journal));
   return tmp;
}

async function run0055(client: PGlite) {
   for (const stmt of readFileSync(join('db/migrations', MIGRATION), 'utf8').split(
      '--> statement-breakpoint'
   ))
      if (stmt.trim()) await client.exec(stmt);
}

describe('migration 0055 sobre dados existentes', () => {
   it('faz backfill do time, troca a chave e não apaga issue; roda duas vezes', async () => {
      const client = new PGlite();
      await migrate(drizzle(client), { migrationsFolder: migrationsUpTo0054() });
      await client.exec(`
         INSERT INTO status (id, name, color, category, position)
            VALUES ('backlog', 'Backlog', '#999', 'backlog', 0);
         INSERT INTO priority (id, name, position, sort_rank) VALUES ('low', 'Low', 0, 3);
         INSERT INTO team (id, name, icon, color, issue_seq) VALUES
            ('ENG', 'Eng', 'x', '#000', 0), ('OPS', 'Ops', 'x', '#000', 0);
         INSERT INTO issue (id, identifier, team_id, title, status_id, priority_id, rank) VALUES
            ('i1', 'ENG-1', 'ENG', 'a', 'backlog', 'low', '0|a'),
            ('i2', 'OPS-1', 'OPS', 'b', 'backlog', 'low', '0|b');
         INSERT INTO issue_import (source, external_id, issue_id) VALUES
            ('csv', 'X-1', 'i1'), ('linear', 'X-1', 'i2');
      `);

      await run0055(client);
      await run0055(client);

      const rows = (
         await client.query<{ source: string; team_id: string }>(
            `SELECT source, team_id FROM issue_import ORDER BY source`
         )
      ).rows;
      expect(rows).toEqual([
         { source: 'csv', team_id: 'ENG' },
         { source: 'linear', team_id: 'OPS' },
      ]);
      expect((await client.query(`SELECT id FROM issue`)).rows).toHaveLength(2);

      // Mesmo (source, external_id) em outro time agora é permitido; no mesmo time, não.
      await client.exec(
         `INSERT INTO issue_import (source, external_id, issue_id, team_id) VALUES ('csv', 'X-1', 'i2', 'OPS')`
      );
      await expect(
         client.exec(
            `INSERT INTO issue_import (source, external_id, issue_id, team_id) VALUES ('csv', 'X-1', 'i1', 'ENG')`
         )
      ).rejects.toThrow();
   });
});
