import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import type { Db } from '@/db';
import { createIssue, updateIssue } from '@/lib/api/issues';
import { createCycle } from '@/lib/api/cycles';
import { setMemberDeactivated } from '@/lib/api/members';

/**
 * Integridade cruzada entre times (#100): o cycle escolhido tem de ser do time da issue,
 * e responsável desativado não pode receber trabalho. Ficou entre os grupos do hardening —
 * o motor de automação validava o desativado, mas criar e editar issue pela API, não.
 */
let db: Db;
const ADMIN = 'admin@nimbloo.ai';
let outroId = '';
let cicloDoOutroTime = '';

const base = { title: 'Issue', statusId: 'to-do', priorityId: 'no-priority' };

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE', 'Core');
   await seedTeam(db, 'OPS', 'Ops');
   await seedUser(db, { name: 'Admin', email: ADMIN, teamIds: ['CORE', 'OPS'], role: 'Admin' });
   outroId = await seedUser(db, { name: 'Saiu', email: 'saiu@nimbloo.ai', teamIds: ['CORE'] });
   cicloDoOutroTime = (
      await createCycle(db, {
         teamId: 'OPS',
         name: 'Ciclo do OPS',
         startDate: '2026-09-01',
         endDate: '2026-09-15',
      })
   ).id;
});

describe('integridade entre times na issue', () => {
   it('criar issue com cycle de outro time → 400', async () => {
      await expect(
         createIssue(db, { ...base, teamId: 'CORE', cycleId: cicloDoOutroTime }, ADMIN)
      ).rejects.toMatchObject({ status: 400 });
   });

   it('mover issue para cycle de outro time → 400', async () => {
      const issue = await createIssue(db, { ...base, teamId: 'CORE' }, ADMIN);
      await expect(
         updateIssue(db, issue.id, { cycleId: cicloDoOutroTime }, ADMIN)
      ).rejects.toMatchObject({ status: 400 });
   });

   it('cycle do próprio time continua aceito, e limpar o cycle segue funcionando', async () => {
      const doCore = await createCycle(db, {
         teamId: 'CORE',
         name: 'Ciclo do CORE',
         startDate: '2026-09-01',
         endDate: '2026-09-15',
      });
      const issue = await createIssue(db, { ...base, teamId: 'CORE', cycleId: doCore.id }, ADMIN);
      expect(issue.cycleId).toBe(doCore.id);
      const limpa = await updateIssue(db, issue.id, { cycleId: '' }, ADMIN);
      expect(limpa?.cycleId).toBe('');
   });

   it('atribuir a usuário desativado → 400, na criação e na edição', async () => {
      const issue = await createIssue(db, { ...base, teamId: 'CORE' }, ADMIN);
      await setMemberDeactivated(db, outroId, true, ADMIN);

      await expect(
         createIssue(db, { ...base, teamId: 'CORE', assigneeId: outroId }, ADMIN)
      ).rejects.toMatchObject({ status: 400 });
      await expect(
         updateIssue(db, issue.id, { assigneeIds: [outroId] }, ADMIN)
      ).rejects.toMatchObject({ status: 400 });
   });
});
