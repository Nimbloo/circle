import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

/**
 * Migration 0052: antes do índice único `label_name_lower_unique`, um passo renomeia
 * duplicatas existentes (mesmo nome sem diferenciar caixa/espaço) com sufixo ' (2)',
 * ' (3)'… sem apagar nada. Testa o SQL da migration em isolamento (tabela mínima),
 * já que uma base de teste nova nunca tem duplicata pré-existente para exercitar o
 * passo dentro do fluxo normal de `makeTestDb`.
 */
describe('migration 0052 — dedupe de nome de label antes do índice único', () => {
   it('renomeia duplicatas com sufixo e o índice único passa a valer', async () => {
      const client = new PGlite();
      await client.exec(`
         CREATE TABLE "label" (
            "id" varchar(64) PRIMARY KEY NOT NULL,
            "name" varchar(128) NOT NULL,
            "color" varchar(32) NOT NULL,
            "group_id" varchar(64)
         );
      `);
      await client.exec(`
         INSERT INTO "label" ("id", "name", "color") VALUES
            ('bug', 'Bug', 'red'),
            ('bug-2', 'bug', 'orange'),
            ('bug-3', ' BUG ', 'yellow'),
            ('tech-debt', 'Tech Debt', 'gray');
      `);

      // Mesmo SQL da migration (0052_striped_famine.sql).
      await client.exec(`
         WITH ranked AS (
            SELECT "id", row_number() OVER (PARTITION BY lower(trim("name")) ORDER BY "id") AS rn
            FROM "label"
         )
         UPDATE "label" l
         SET "name" = l."name" || ' (' || ranked.rn || ')'
         FROM ranked
         WHERE l."id" = ranked."id" AND ranked.rn > 1;
      `);
      await client.exec(`
         CREATE UNIQUE INDEX "label_name_lower_unique" ON "label" USING btree (lower(trim("name")));
      `);

      const rows = (
         await client.query<{ id: string; name: string }>(
            'SELECT id, name FROM "label" ORDER BY id'
         )
      ).rows;
      expect(rows).toEqual([
         { id: 'bug', name: 'Bug' }, // menor id: mantém o nome original
         { id: 'bug-2', name: 'bug (2)' },
         { id: 'bug-3', name: ' BUG  (3)' },
         { id: 'tech-debt', name: 'Tech Debt' }, // sem duplicata: intocado
      ]);

      // Nada foi apagado — 4 linhas antes e depois.
      expect(rows).toHaveLength(4);

      // O índice agora recusa uma nova duplicata.
      await expect(
         client.exec(`INSERT INTO "label" ("id", "name", "color") VALUES ('bug-4', 'Bug', 'blue');`)
      ).rejects.toThrow();

      await client.close();
   });
});
