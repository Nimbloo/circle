import { readFileSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { initiative as initiativeT, initiativeProject } from '@/db/schema';
import { createProject, getProject, updateProject } from '@/lib/api/projects';
import {
   createInitiative,
   listInitiatives,
   getInitiative,
   updateInitiative,
   deleteInitiative,
   listInitiativeActivity,
} from '@/lib/api/initiatives';
import { createLabel, deleteLabel } from '@/lib/api/labels';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   return db;
}

const baseProj = { priorityId: 'high', healthId: 'on-track', teamId: 'CORE' as const };

describe('initiatives', () => {
   it('creates an initiative with nested priority/health and project counts', async () => {
      const db = await setup();
      const p1 = await createProject(db, { name: 'P1', statusId: 'proj-completed', ...baseProj }); // completed
      const p2 = await createProject(db, { name: 'P2', statusId: 'proj-in-progress', ...baseProj }); // não

      const init = await createInitiative(db, {
         slug: 'platform',
         name: 'Platform',
         priorityId: 'urgent',
         healthId: 'at-risk',
         projectIds: [p1.id, p2.id],
      });
      expect(init.priority.id).toBe('urgent');
      expect(init.health.id).toBe('at-risk');
      expect(init.projectCount).toBe(2);
      expect(init.completedProjectCount).toBe(1); // só p1 (done)
   });

   it('cria e atualiza labels e metadados de ícone sem quebrar campos existentes', async () => {
      const db = await setup();
      await createLabel(db, { id: 'growth', name: 'Growth', color: 'purple' });
      await createLabel(db, { id: 'platform', name: 'Platform', color: 'blue' });

      const init = await createInitiative(db, {
         slug: 'north-star',
         name: 'North Star',
         priorityId: 'high',
         healthId: 'on-track',
         icon: 'rocket',
         iconColor: 'violet',
         labelIds: ['growth', 'platform'],
      });

      expect(init.icon).toBe('rocket');
      expect(init.iconColor).toBe('violet');
      expect(init.labels.map((label) => label.id).sort()).toEqual(['growth', 'platform']);

      const updated = await updateInitiative(db, init.id, {
         iconColor: 'green',
         labelIds: ['platform'],
      });
      expect(updated?.iconColor).toBe('green');
      expect(updated?.labels.map((label) => label.id)).toEqual(['platform']);
   });

   it('limpa vínculos de initiative ao excluir um label', async () => {
      const db = await setup();
      await createLabel(db, { id: 'growth', name: 'Growth', color: 'purple' });
      const init = await createInitiative(db, {
         slug: 'growth-plan',
         name: 'Growth plan',
         priorityId: 'high',
         healthId: 'on-track',
         labelIds: ['growth'],
      });

      await expect(deleteLabel(db, 'growth')).resolves.toBe(true);
      expect((await getInitiative(db, init.id))?.labels).toEqual([]);
   });

   it('filters by status and priority', async () => {
      const db = await setup();
      await createInitiative(db, {
         slug: 'a',
         name: 'A',
         priorityId: 'urgent',
         healthId: 'on-track',
         status: 'active',
      });
      await createInitiative(db, {
         slug: 'b',
         name: 'B',
         priorityId: 'low',
         healthId: 'on-track',
         status: 'planned',
      });
      expect(await listInitiatives(db, { status: ['active'] })).toHaveLength(1);
      expect(await listInitiatives(db, { priority: ['low'] })).toHaveLength(1);
   });

   it('updates and deletes', async () => {
      const db = await setup();
      const init = await createInitiative(db, {
         slug: 'a',
         name: 'A',
         priorityId: 'urgent',
         healthId: 'on-track',
      });
      const upd = await updateInitiative(db, init.id, { status: 'completed', name: 'A2' });
      expect(upd?.status).toBe('completed');
      expect(upd?.name).toBe('A2');
      expect(await deleteInitiative(db, init.id)).toBe(true);
      expect(await getInitiative(db, init.id)).toBeNull();
   });

   it('createProject com initiativeId aparece no projectCount da initiative (sincroniza o vínculo)', async () => {
      const db = await setup();
      const init = await createInitiative(db, {
         slug: 'platform',
         name: 'Platform',
         priorityId: 'urgent',
         healthId: 'on-track',
      });
      await createProject(db, {
         name: 'P',
         statusId: 'proj-in-progress',
         ...baseProj,
         initiativeId: init.id,
      });
      const got = await getInitiative(db, init.id);
      expect(got?.projectCount).toBe(1);
   });

   it('updateProject setando initiativeId sincroniza os dois lados', async () => {
      const db = await setup();
      const init = await createInitiative(db, {
         slug: 'platform',
         name: 'Platform',
         priorityId: 'urgent',
         healthId: 'on-track',
      });
      const p = await createProject(db, { name: 'P', statusId: 'proj-in-progress', ...baseProj });
      expect((await getInitiative(db, init.id))?.projectCount).toBe(0);

      await updateProject(db, p.id, { initiativeId: init.id });
      expect((await getInitiative(db, init.id))?.projectCount).toBe(1);

      // desvincular limpa o join também
      await updateProject(db, p.id, { initiativeId: null });
      expect((await getInitiative(db, init.id))?.projectCount).toBe(0);
   });

   it('updateInitiative com projectIds sincroniza project.initiativeId dos afetados', async () => {
      const db = await setup();
      const init = await createInitiative(db, {
         slug: 'platform',
         name: 'Platform',
         priorityId: 'urgent',
         healthId: 'on-track',
      });
      const p1 = await createProject(db, { name: 'P1', statusId: 'proj-in-progress', ...baseProj });
      const p2 = await createProject(db, { name: 'P2', statusId: 'proj-in-progress', ...baseProj });

      await updateInitiative(db, init.id, { projectIds: [p1.id, p2.id] });
      expect((await getProject(db, p1.id))?.initiativeId).toBe(init.id);
      expect((await getProject(db, p2.id))?.initiativeId).toBe(init.id);
      expect((await getInitiative(db, init.id))?.projectCount).toBe(2);

      // remover p2 do conjunto limpa a back-reference dele
      await updateInitiative(db, init.id, { projectIds: [p1.id] });
      expect((await getProject(db, p1.id))?.initiativeId).toBe(init.id);
      expect((await getProject(db, p2.id))?.initiativeId).toBeNull();
      expect((await getInitiative(db, init.id))?.projectCount).toBe(1);
   });

   it('deleting an initiative nullifies project.initiativeId and clears links (FK safe)', async () => {
      const db = await setup();
      const init = await createInitiative(db, {
         slug: 'platform',
         name: 'Platform',
         priorityId: 'high',
         healthId: 'on-track',
      });
      const p = await createProject(db, {
         name: 'P',
         statusId: 'proj-in-progress',
         ...baseProj,
         initiativeId: init.id,
      });
      await db
         .insert(initiativeProject)
         .values({ initiativeId: init.id, projectId: p.id })
         .onConflictDoNothing();

      expect(await deleteInitiative(db, init.id)).toBe(true);
      expect(await getInitiative(db, init.id)).toBeNull();

      const proj = await getProject(db, p.id);
      expect(proj).not.toBeNull(); // projeto preservado
      expect(proj?.initiativeId).toBeNull(); // vínculo direto nulificado
   });
   /**
    * Paridade com project: toda alteração vira uma linha no feed, resumindo os campos
    * mudados. Sem ator conhecido não loga (mesma regra do updateProject).
    */
   it('grava o feed de alteracoes no update e lista mais recente primeiro', async () => {
      const db = await setup();
      const actor = 'ana@nimbloo.ai';
      const init = await createInitiative(db, {
         slug: 'obs',
         name: 'Observabilidade',
         priorityId: 'high',
         healthId: 'on-track',
      });

      await updateInitiative(db, init.id, { status: 'completed', ownerId: null }, actor);
      await updateInitiative(db, init.id, { name: 'Observabilidade v2' }, actor);

      const feed = await listInitiativeActivity(db, init.id);
      expect(feed).toHaveLength(2);
      expect(feed[0].text).toContain('name'); // mais recente primeiro
      expect(feed[1].text).toContain('status');
      expect(feed[0].user?.email).toBe(actor);
   });

   it('cria com startDate/targetDate reais e atualiza as datas (inclusive limpando)', async () => {
      const db = await setup();
      const init = await createInitiative(db, {
         slug: 'dates',
         name: 'Dates',
         priorityId: 'high',
         healthId: 'on-track',
         target: 'Q3 2026',
         startDate: '2026-07-01',
         targetDate: '2026-09-30',
      });
      expect(init.startDate).toBe('2026-07-01');
      expect(init.targetDate).toBe('2026-09-30');
      expect(init.target).toBe('Q3 2026');

      const moved = await updateInitiative(db, init.id, {
         target: 'Q4 2026',
         targetDate: '2026-12-31',
         startDate: '2026-10-01',
      });
      expect(moved?.startDate).toBe('2026-10-01');
      expect(moved?.targetDate).toBe('2026-12-31');

      const cleared = await updateInitiative(db, init.id, { startDate: null, targetDate: null });
      expect(cleared?.startDate).toBeNull();
      expect(cleared?.targetDate).toBeNull();
      expect(cleared?.target).toBe('Q4 2026'); // rótulo não é tocado
   });

   it('deriva targetDate do rótulo quando só `target` vem (cliente antigo)', async () => {
      const db = await setup();
      const init = await createInitiative(db, {
         slug: 'label-only',
         name: 'Label only',
         priorityId: 'high',
         healthId: 'on-track',
         target: 'H1 2027',
      });
      expect(init.targetDate).toBe('2027-06-30');

      // Rótulo livre: data fica nula, rótulo segue.
      const free = await updateInitiative(db, init.id, { target: 'Sep 30th' });
      expect(free?.target).toBe('Sep 30th');
      expect(free?.targetDate).toBeNull();

      const monthly = await updateInitiative(db, init.id, { target: 'Sep 2027' });
      expect(monthly?.targetDate).toBe('2027-09-30');

      // `targetDate` explícito vence o rótulo.
      const explicit = await updateInitiative(db, init.id, {
         target: 'Q4 2027',
         targetDate: '2027-11-15',
      });
      expect(explicit?.targetDate).toBe('2027-11-15');

      const none = await updateInitiative(db, init.id, { target: null });
      expect(none?.target).toBeNull();
      expect(none?.targetDate).toBeNull();
   });

   it('rótulo e data juntos viram um único "target" no feed', async () => {
      const db = await setup();
      const init = await createInitiative(db, {
         slug: 'feed',
         name: 'Feed',
         priorityId: 'high',
         healthId: 'on-track',
      });
      await updateInitiative(
         db,
         init.id,
         { target: 'Q3 2026', targetDate: '2026-09-30', startDate: '2026-07-01' },
         'ana@nimbloo.ai'
      );
      const [entry] = await listInitiativeActivity(db, init.id);
      expect(entry.text).toBe('changed target, start date');
   });

   /**
    * A migration custom 0037 deriva `target_date` do rótulo `target` já gravado. O
    * `makeTestDb` roda as migrations num banco vazio, então o teste insere o rótulo
    * direto e reaplica o SQL (idempotente: só toca linhas com target_date nulo).
    */
   it('backfill deriva target_date do rótulo target já existente', async () => {
      const db = await setup();
      const rows = [
         ['q3', 'Q3 2026', '2026-09-30'],
         ['h1', 'H1 2026', '2026-06-30'],
         ['year', '2026', '2026-12-31'],
         ['month', 'Sep 2026', '2026-09-30'],
         ['iso-month', '2026-09', '2026-09-30'],
         ['iso', '2026-09-15', '2026-09-15'],
         ['free', 'Sep 30th', null],
      ] as const;
      await db.insert(initiativeT).values(
         rows.map(([id, target]) => ({
            id,
            slug: id,
            name: id,
            status: 'planned',
            priorityId: 'high',
            healthId: 'on-track',
            target,
         }))
      );

      await db.execute(
         sql.raw(readFileSync('db/migrations/0037_backfill_initiative_dates.sql', 'utf8'))
      );

      for (const [id, , expected] of rows) {
         const [row] = await db
            .select({ targetDate: initiativeT.targetDate })
            .from(initiativeT)
            .where(eq(initiativeT.id, id));
         expect([id, row.targetDate]).toEqual([id, expected]);
      }
   });

   it('nao grava feed sem ator, nem para campo que nao e rastreado', async () => {
      const db = await setup();
      const init = await createInitiative(db, {
         slug: 'x',
         name: 'X',
         priorityId: 'high',
         healthId: 'on-track',
      });

      await updateInitiative(db, init.id, { name: 'Y' }); // sem actorEmail
      expect(await listInitiativeActivity(db, init.id)).toHaveLength(0);

      // `description` nao entra no feed (ruido) — igual project
      await updateInitiative(db, init.id, { description: 'texto' }, 'ana@nimbloo.ai');
      expect(await listInitiativeActivity(db, init.id)).toHaveLength(0);
   });
});
