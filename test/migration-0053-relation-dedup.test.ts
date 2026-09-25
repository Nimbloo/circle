import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { sql } from 'drizzle-orm';

/**
 * Migration 0053 com DADOS: relações repetidas (adds concorrentes antes do índice) viram
 * uma só, e o índice único é criado sem estourar.
 */
const MIGRATION = readdirSync('db/migrations').find((f) => f.startsWith('0053_'))!;
const before = mkdtempSync(join(tmpdir(), 'circle-mig-'));
afterAll(() => rmSync(before, { recursive: true, force: true }));

function migrationsUpTo0052(): string {
   cpSync('db/migrations', before, { recursive: true });
   rmSync(join(before, MIGRATION));
   const journalPath = join(before, 'meta', '_journal.json');
   const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
   journal.entries = journal.entries.filter((e: { idx: number }) => e.idx < 53);
   writeFileSync(journalPath, JSON.stringify(journal));
   return before;
}

describe('migration 0053 sobre dados existentes', () => {
   it('remove duplicatas exatas de issue_relation e cria o índice único', async () => {
      const client = new PGlite();
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: migrationsUpTo0052() });
      await db.execute(sql`
         INSERT INTO status (id, name, color, category, position)
         VALUES ('backlog', 'Backlog', '#999', 'backlog', 0)`);
      await db.execute(sql`
         INSERT INTO priority (id, name, position, sort_rank) VALUES ('low', 'Low', 0, 3)`);
      await db.execute(sql`
         INSERT INTO team (id, name, icon, color, issue_seq) VALUES ('ENG', 'Eng', 'x', '#000', 0)`);
      for (const id of ['a', 'b'])
         await db.execute(sql`
            INSERT INTO issue (id, identifier, team_id, title, status_id, priority_id, rank)
            VALUES (${id}, ${id}, 'ENG', ${id}, 'backlog', 'low', ${id})`);
      await db.execute(sql`
         INSERT INTO issue_relation (id, issue_id, related_id, kind) VALUES
            ('r1', 'a', 'b', 'blocked_by'),
            ('r2', 'a', 'b', 'blocked_by'),
            ('r3', 'a', 'b', 'related')`);

      await migrate(db, { migrationsFolder: 'db/migrations' });

      const rows = await db.execute(sql`SELECT id FROM issue_relation ORDER BY id`);
      expect(rows.rows.map((r) => (r as { id: string }).id)).toEqual(['r1', 'r3']);
      await expect(
         db.execute(sql`
            INSERT INTO issue_relation (id, issue_id, related_id, kind)
            VALUES ('r4', 'a', 'b', 'blocked_by')`)
      ).rejects.toThrow();
   });
});
