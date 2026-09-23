import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

/**
 * Migration 0052: antes do índice único `label_name_lower_unique`, um passo renomeia
 * duplicatas existentes (mesmo nome sem diferenciar caixa/espaço) com o menor sufixo
 * ' (n)' livre, sem apagar nada. Roda os statements de `label` da PRÓPRIA migration
 * numa tabela mínima, já que uma base de teste nova nunca tem duplicata pré-existente.
 */
const labelStatements = readFileSync('db/migrations/0052_striped_famine.sql', 'utf8')
   .split('--> statement-breakpoint')
   .filter((stmt) => /UPDATE "label"|label_name_lower_unique/.test(stmt));

async function migrate(rows: Array<[string, string]>) {
   const client = new PGlite();
   await client.exec(`
      CREATE TABLE "label" (
         "id" varchar(64) PRIMARY KEY NOT NULL,
         "name" varchar(128) NOT NULL,
         "color" varchar(32) NOT NULL,
         "group_id" varchar(64)
      );
   `);
   for (const [id, name] of rows)
      await client.query('INSERT INTO "label" ("id", "name", "color") VALUES ($1, $2, $3)', [
         id,
         name,
         'gray',
      ]);
   for (const stmt of labelStatements) await client.exec(stmt);
   const after = (
      await client.query<{ id: string; name: string }>('SELECT id, name FROM "label" ORDER BY id')
   ).rows;
   return { client, after };
}

describe('migration 0052 — dedupe de nome de label antes do índice único', () => {
   it('usa os dois statements de label da migration', () => {
      expect(labelStatements).toHaveLength(2);
   });

   it('renomeia duplicatas com sufixo e o índice único passa a valer', async () => {
      const { client, after } = await migrate([
         ['bug', 'Bug'],
         ['bug-2', 'bug'],
         ['bug-3', ' BUG '],
         ['tech-debt', 'Tech Debt'],
      ]);
      expect(after).toEqual([
         { id: 'bug', name: 'Bug' }, // menor id: mantém o nome original
         { id: 'bug-2', name: 'bug (2)' },
         { id: 'bug-3', name: 'BUG (3)' },
         { id: 'tech-debt', name: 'Tech Debt' }, // sem duplicata: intocado
      ]);
      await expect(
         client.exec(`INSERT INTO "label" ("id", "name", "color") VALUES ('bug-4', 'Bug', 'blue');`)
      ).rejects.toThrow();
      await client.close();
   });

   it('pula um sufixo que já existe como label', async () => {
      const { client, after } = await migrate([
         ['a', 'Bug'],
         ['b', 'bug'],
         ['c', 'Bug (2)'],
      ]);
      expect(after).toEqual([
         { id: 'a', name: 'Bug' },
         { id: 'b', name: 'bug (3)' },
         { id: 'c', name: 'Bug (2)' },
      ]);
      await client.close();
   });

   it('trunca o nome base para caber em 128 caracteres', async () => {
      const long = 'x'.repeat(128);
      const { client, after } = await migrate([
         ['a', long],
         ['b', long.toUpperCase()],
      ]);
      expect(after[0].name).toBe(long);
      expect(after[1].name).toBe(`${'X'.repeat(124)} (2)`);
      expect(after[1].name).toHaveLength(128);
      await client.close();
   });
});
