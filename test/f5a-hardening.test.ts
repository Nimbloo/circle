import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { cycle, status } from '@/db/schema';
import { seedCatalogs } from '@/db/seed-catalogs';

describe('hardening transversal da F5a', () => {
   it('não ressuscita um catálogo excluído quando a tabela ainda tem dados', async () => {
      const db = await makeTestDb();
      await db.delete(status).where(eq(status.id, 'done'));

      await seedCatalogs(db);

      expect((await db.select({ id: status.id }).from(status)).map((row) => row.id)).not.toContain(
         'done'
      );
   });

   it('permite no máximo um cycle current por time', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const base = {
         teamId: 'CORE',
         status: 'current',
         startDate: '2026-01-01',
         endDate: '2026-01-14',
         capacity: 0,
      } as const;
      await db.insert(cycle).values({ ...base, id: 'c1', number: 1, name: 'C1' });
      const indexes = await db.execute(
         sql`select indexname from pg_indexes where indexname = 'cycle_team_current_unique'`
      );
      expect(indexes.rows).toHaveLength(1);

      await expect(
         db.insert(cycle).values({ ...base, id: 'c2', number: 2, name: 'C2' })
      ).rejects.toThrow();
   });

   it('expõe os vetores de busca GIN e o índice temporal de reviews', async () => {
      const db = await makeTestDb();
      const vectors = await db.execute(
         sql`select tablename, indexname from pg_indexes where indexname in (
            'idx_issue_search_vector',
            'idx_issue_content_search_vector',
            'idx_project_search_vector',
            'idx_project_detail_search_vector',
            'idx_initiative_search_vector',
            'idx_team_document_search_vector'
         )`
      );
      const reviews = await db.execute(
         sql`select indexname from pg_indexes where indexname = 'idx_review_created_at'`
      );
      expect(vectors.rows).toHaveLength(6);
      expect(reviews.rows).toHaveLength(1);
   });
});
