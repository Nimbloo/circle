import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { sql } from 'drizzle-orm';
import * as schema from '@/db/schema';
import type { Db } from '@/db';
import { seedCatalogs } from '@/db/seed-catalogs';

/**
 * Migration 0050 com DADOS (a suíte só a roda em banco vazio): banco até a 0049, com
 * ranks longos e dois cycles `current` no mesmo time, e então a 0050.
 */
const MIGRATION = readdirSync('db/migrations').find((f) => f.startsWith('0050_'))!;
const tmp = mkdtempSync(join(tmpdir(), 'circle-mig-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function migrationsUpTo0049(): string {
   cpSync('db/migrations', tmp, { recursive: true });
   rmSync(join(tmp, MIGRATION));
   const journalPath = join(tmp, 'meta', '_journal.json');
   const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
   journal.entries = journal.entries.filter((e: { idx: number }) => e.idx < 50);
   writeFileSync(journalPath, JSON.stringify(journal));
   return tmp;
}

describe('migration 0050 sobre dados existentes', () => {
   it('normaliza ranks por time preservando a ordem e encerra cycles current duplicados', async () => {
      const client = new PGlite();
      const db = drizzle(client, { schema }) as unknown as Db;
      await migrate(drizzle(client), { migrationsFolder: migrationsUpTo0049() });
      await seedCatalogs(db);
      await db.execute(sql`
         INSERT INTO team (id, name, icon, color, issue_seq) VALUES
            ('ENG', 'Eng', 'x', '#000', 0), ('OPS', 'Ops', 'x', '#000', 0)`);
      // Ranks longos (como os de produção) numa ordem que não é a de inserção.
      const ranks = [
         ['e1', 'ENG', '0|a3c' + 'z'.repeat(40)],
         ['e2', 'ENG', '0|a3b' + 'k'.repeat(55)],
         ['e3', 'ENG', '0|a3d'],
         ['o1', 'OPS', '0|zz'],
         ['o2', 'OPS', '0|aa' + 'm'.repeat(50)],
      ];
      for (const [id, teamId, rank] of ranks)
         await db.execute(sql`
            INSERT INTO issue (id, identifier, team_id, title, status_id, priority_id, rank)
            VALUES (${id}, ${id.toUpperCase()}, ${teamId}, ${id}, 'backlog', 'low', ${rank})`);
      await db.execute(sql`
         INSERT INTO cycle (id, number, name, team_id, status, start_date, end_date, capacity) VALUES
            ('c-old', 1, 'C1', 'ENG', 'current', '2026-01-01', '2026-01-14', 0),
            ('c-new', 2, 'C2', 'ENG', 'current', '2026-02-01', '2026-02-14', 0)`);

      for (const stmt of readFileSync(join('db/migrations', MIGRATION), 'utf8').split(
         '--> statement-breakpoint'
      ))
         if (stmt.trim()) await client.exec(stmt);

      const rows = (
         await client.query<{ id: string; team_id: string; rank: string }>(
            `SELECT id, team_id, rank FROM issue ORDER BY team_id, rank`
         )
      ).rows;
      expect(rows.map((r) => r.id)).toEqual(['e2', 'e1', 'e3', 'o2', 'o1']);
      expect(rows.every((r) => r.rank.length <= 32)).toBe(true);
      expect(rows.find((r) => r.id === 'e2')!.rank).toBe('0|00000003');

      const cycles = (
         await client.query<{ id: string; status: string }>(
            `SELECT id, status FROM cycle ORDER BY id`
         )
      ).rows;
      expect(cycles).toEqual([
         { id: 'c-new', status: 'current' },
         { id: 'c-old', status: 'completed' },
      ]);
   });
});
