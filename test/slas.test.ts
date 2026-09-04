import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { issue as issueT } from '@/db/schema';
import { createIssue, updateIssue } from '@/lib/api/issues';
import { listTeamSlas, setTeamSla, applySla, MAX_SLA_HOURS } from '@/lib/api/slas';
import { slaDueDate, slaState } from '@/lib/sla';

const ANA = 'ana@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ANA, role: 'Admin' });
   return db;
}

describe('team_sla — configuração por prioridade', () => {
   it('define, atualiza e remove o SLA; valida time, prioridade e horas', async () => {
      const db = await setup();
      expect(await listTeamSlas(db, 'CORE')).toEqual([]);

      let list = await setTeamSla(db, 'CORE', 'urgent', 4);
      expect(list).toEqual([{ teamId: 'CORE', priorityId: 'urgent', hours: 4 }]);
      // upsert (mesma PK) não duplica
      list = await setTeamSla(db, 'CORE', 'urgent', 8);
      expect(list).toEqual([{ teamId: 'CORE', priorityId: 'urgent', hours: 8 }]);

      await setTeamSla(db, 'CORE', 'high', 48);
      expect(await listTeamSlas(db, 'CORE')).toHaveLength(2);

      expect(await setTeamSla(db, 'CORE', 'high', null)).toEqual([
         { teamId: 'CORE', priorityId: 'urgent', hours: 8 },
      ]);

      await expect(setTeamSla(db, 'NOPE', 'urgent', 4)).rejects.toMatchObject({ status: 404 });
      await expect(setTeamSla(db, 'CORE', 'nope', 4)).rejects.toMatchObject({ status: 400 });
      await expect(setTeamSla(db, 'CORE', 'urgent', 0)).rejects.toMatchObject({ status: 400 });
      await expect(setTeamSla(db, 'CORE', 'urgent', MAX_SLA_HOURS + 1)).rejects.toMatchObject({
         status: 400,
      });
   });

   it('applySla calcula o due date a partir das horas (e null sem SLA)', async () => {
      const db = await setup();
      const now = new Date('2026-03-10T08:00:00.000Z');
      expect(await applySla(db, 'CORE', 'urgent', now)).toBeNull();
      await setTeamSla(db, 'CORE', 'urgent', 48);
      expect(await applySla(db, 'CORE', 'urgent', now)).toEqual({
         dueDate: '2026-03-12',
         slaAppliedAt: now,
         hours: 48,
      });
      expect(slaDueDate(now, 4)).toBe('2026-03-10');
   });
});

describe('aplicação do SLA na issue', () => {
   it('issue criada sem due date recebe o prazo, a marca e a activity', async () => {
      const db = await setup();
      await setTeamSla(db, 'CORE', 'urgent', 24);
      const dto = await createIssue(
         db,
         { teamId: 'CORE', title: 'Fogo', statusId: 'to-do', priorityId: 'urgent' },
         ANA
      );
      expect(dto.dueDate).not.toBeNull();
      expect(dto.slaAppliedAt).not.toBeNull();
      const [row] = await db.select().from(issueT).where(eq(issueT.id, dto.id));
      expect(row.dueDate).toBe(dto.dueDate);
      expect(row.slaAppliedAt).toBeInstanceOf(Date);
   });

   it('due date manual na criação vence o SLA (sem marca)', async () => {
      const db = await setup();
      await setTeamSla(db, 'CORE', 'urgent', 24);
      const dto = await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Manual',
            statusId: 'to-do',
            priorityId: 'urgent',
            dueDate: '2026-12-31',
         },
         ANA
      );
      expect(dto.dueDate).toBe('2026-12-31');
      expect(dto.slaAppliedAt).toBeNull();
   });

   it('prioridade sem SLA não aplica prazo nenhum', async () => {
      const db = await setup();
      await setTeamSla(db, 'CORE', 'urgent', 24);
      const dto = await createIssue(
         db,
         { teamId: 'CORE', title: 'Calmo', statusId: 'to-do', priorityId: 'low' },
         ANA
      );
      expect(dto.dueDate).toBeNull();
      expect(dto.slaAppliedAt).toBeNull();
   });

   it('trocar a prioridade recalcula o prazo; due date manual não é sobrescrito', async () => {
      const db = await setup();
      await setTeamSla(db, 'CORE', 'urgent', 24);
      await setTeamSla(db, 'CORE', 'high', 168);

      const auto = await createIssue(
         db,
         { teamId: 'CORE', title: 'Auto', statusId: 'to-do', priorityId: 'high' },
         ANA
      );
      const first = auto.dueDate;
      const bumped = await updateIssue(db, auto.id, { priorityId: 'urgent' }, ANA);
      expect(bumped?.dueDate).not.toBe(first);
      expect(bumped?.slaAppliedAt).not.toBeNull();

      const manual = await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Manual',
            statusId: 'to-do',
            priorityId: 'low',
            dueDate: '2026-12-31',
         },
         ANA
      );
      const kept = await updateIssue(db, manual.id, { priorityId: 'urgent' }, ANA);
      expect(kept?.dueDate).toBe('2026-12-31');
      expect(kept?.slaAppliedAt).toBeNull();
   });

   it('definir o due date manualmente desliga o SLA da issue', async () => {
      const db = await setup();
      await setTeamSla(db, 'CORE', 'urgent', 24);
      const dto = await createIssue(
         db,
         { teamId: 'CORE', title: 'Fogo', statusId: 'to-do', priorityId: 'urgent' },
         ANA
      );
      const patched = await updateIssue(db, dto.id, { dueDate: '2026-11-01' }, ANA);
      expect(patched?.dueDate).toBe('2026-11-01');
      expect(patched?.slaAppliedAt).toBeNull();
   });
});

describe('slaState — indicador', () => {
   const applied = '2026-03-10T00:00:00.000Z';

   it('none sem marca de SLA e em issue concluída/cancelada', () => {
      expect(slaState({ dueDate: '2026-03-12', slaAppliedAt: null })).toBe('none');
      expect(
         slaState({
            dueDate: '2026-03-01',
            slaAppliedAt: applied,
            statusCategory: 'completed',
         })
      ).toBe('none');
   });

   it('ok, at-risk (<25% restante) e breached (vencido)', () => {
      const due = '2026-03-14'; // vence 2026-03-14T23:59:59.999Z (janela de ~5 dias)
      const issue = { dueDate: due, slaAppliedAt: applied, statusCategory: 'started' };
      expect(slaState(issue, new Date('2026-03-11T00:00:00Z'))).toBe('ok');
      expect(slaState(issue, new Date('2026-03-14T12:00:00Z'))).toBe('at-risk');
      expect(slaState(issue, new Date('2026-03-15T00:30:00Z'))).toBe('breached');
   });
});
