import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '@/db';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { issue, issueContent } from '@/db/schema';
import { createView, resolveView } from '@/lib/api/views';

let db: Db;
let ownerId: string;
const ownerEmail = 'ana@nimbloo.ai';

async function addIssue(
   id: string,
   identifier: string,
   title: string,
   description: string | null,
   statusId = 'in-progress'
) {
   const now = new Date('2026-01-01T00:00:00Z');
   await db.insert(issue).values({
      id,
      identifier,
      teamId: 'CORE',
      title,
      statusId,
      priorityId: 'high',
      assigneeId: null,
      createdById: ownerId,
      projectId: null,
      cycleId: null,
      rank: id,
      createdAt: now,
      updatedAt: now,
   });
   if (description !== null) await db.insert(issueContent).values({ issueId: id, description });
}

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   ownerId = await seedUser(db, { name: 'Ana', email: ownerEmail, teamIds: ['CORE'] });
});

describe('saved search — a view reproduz a busca', () => {
   it('resolve pelo mesmo motor: só os acertos, na ordem de relevância', async () => {
      await addIssue('i-desc', 'CORE-1', 'Assunto qualquer', 'telemetria citada no corpo');
      await addIssue('i-title', 'CORE-2', 'Telemetria distribuída', null);
      await addIssue('i-fora', 'CORE-3', 'Nada a ver', 'nem no corpo');

      const view = await createView(
         db,
         {
            slug: 'busca-telemetria',
            name: 'Telemetria',
            type: 'issue',
            filter: { q: 'telemetria' },
            teamId: 'CORE',
         },
         ownerEmail
      );

      const resolved = await resolveView(db, view.id);
      expect(resolved?.issues?.map((i) => i.id)).toEqual(['i-title', 'i-desc']);
   });

   it('o termo compõe com os demais filtros da view (interseção)', async () => {
      await addIssue('i-prog', 'CORE-1', 'Telemetria travada', null, 'in-progress');
      await addIssue('i-done', 'CORE-2', 'Telemetria concluída', null, 'done');

      const view = await createView(
         db,
         {
            slug: 'busca-telemetria-feita',
            name: 'Telemetria concluída',
            type: 'issue',
            filter: { q: 'telemetria', statusIds: ['done'] },
            teamId: 'CORE',
         },
         ownerEmail
      );

      const resolved = await resolveView(db, view.id);
      expect(resolved?.issues?.map((i) => i.id)).toEqual(['i-done']);
   });

   it('view sem termo continua devolvendo tudo que o filtro deixa passar', async () => {
      await addIssue('i-1', 'CORE-1', 'Uma issue', null);
      const view = await createView(
         db,
         { slug: 'todas', name: 'Todas', type: 'issue', filter: {}, teamId: 'CORE' },
         ownerEmail
      );
      const resolved = await resolveView(db, view.id);
      expect(resolved?.issues?.map((i) => i.id)).toEqual(['i-1']);
   });

   it('o termo sobrevive ao round-trip do filtro salvo (JSON)', async () => {
      const view = await createView(
         db,
         {
            slug: 'busca-x',
            name: 'Busca X',
            type: 'issue',
            filter: { q: 'login SSO', statusCategories: ['started'] },
         },
         ownerEmail
      );
      expect(view.filter.q).toBe('login SSO');
   });
});
