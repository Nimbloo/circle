import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { issue as issueT } from '@/db/schema';
import { setTeamSla, applySla } from '@/lib/api/slas';
import { slaState, slaDeadline } from '@/lib/sla';
import { createIssue, updateIssue } from '@/lib/api/issues';

const ANA = 'ana@nimbloo.ai';

/**
 * SLA sub-diário (auditoria v0.29.0). Antes desta correção o prazo morava só no
 * `due_date` (`date`, sem hora): aplicados às 09:00, SLAs de 1 h, 2 h, 4 h, 8 h e 12 h
 * davam EXATAMENTE o mesmo prazo, e às 22:00 um SLA de 4 h virava 26 h. Trocar a
 * prioridade ainda ressuscitava uma issue já estourada.
 */

const NINE_AM = new Date('2026-03-10T09:00:00Z');
const TEN_PM = new Date('2026-03-10T22:00:00Z');

describe('SLA — vencimento com hora', () => {
   it('cada janela contratada dá um vencimento diferente e monotônico', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');

      const hours = [1, 2, 4, 8, 12];
      const deadlines: number[] = [];
      for (const h of hours) {
         await setTeamSla(db, 'CORE', 'urgent', h);
         const applied = await applySla(db, 'CORE', 'urgent', NINE_AM);
         expect(applied).not.toBeNull();
         deadlines.push(applied!.dueAt.getTime());
      }

      // Prazo = exatamente a janela contratada (era o mesmo fim-de-dia para todas).
      expect(deadlines).toEqual(hours.map((h) => NINE_AM.getTime() + h * 3_600_000));
      expect(new Set(deadlines).size).toBe(hours.length);
      // Monotônico: mais horas contratadas nunca dá prazo menor.
      expect([...deadlines].sort((a, b) => a - b)).toEqual(deadlines);
   });

   it('aplicar às 22:00 não infla o prazo (era 26 h para um SLA de 4 h)', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await setTeamSla(db, 'CORE', 'urgent', 4);
      const applied = await applySla(db, 'CORE', 'urgent', TEN_PM);
      expect(applied!.dueAt.toISOString()).toBe('2026-03-11T02:00:00.000Z');
      // A data humana acompanha o vencimento real (vira o dia seguinte).
      expect(applied!.dueDate).toBe('2026-03-11');
   });

   it('slaState respeita a hora: 4 h aplicadas às 09:00 estouram às 13:01', () => {
      const issue = {
         dueDate: '2026-03-10',
         slaDueAt: '2026-03-10T13:00:00.000Z',
         slaAppliedAt: NINE_AM.toISOString(),
         statusCategory: 'started',
      };
      expect(slaState(issue, new Date('2026-03-10T10:00:00Z'))).toBe('ok');
      // "at risk" com a janela CONTRATADA (25% de 4 h = a última hora), não a arredondada.
      expect(slaState(issue, new Date('2026-03-10T12:15:00Z'))).toBe('at-risk');
      expect(slaState(issue, new Date('2026-03-10T13:01:00Z'))).toBe('breached');
   });

   it('linha antiga (sem sla_due_at) mantém o fim do dia — sem mudar de estado na migration', () => {
      const legacy = {
         dueDate: '2026-03-10',
         slaAppliedAt: NINE_AM.toISOString(),
         statusCategory: 'started',
      };
      expect(slaDeadline(legacy)).toBe(Date.parse('2026-03-10T23:59:59.999Z'));
      expect(slaState(legacy, new Date('2026-03-10T13:01:00Z'))).toBe('ok');
   });
});

describe('SLA — troca de prioridade não ressuscita issue estourada', () => {
   it('issue breached continua breached depois de rebaixar a prioridade', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await seedUser(db, { name: 'Ana', email: ANA, role: 'Admin' });
      await setTeamSla(db, 'CORE', 'urgent', 1);
      await setTeamSla(db, 'CORE', 'low', 720); // 30 dias

      const created = await createIssue(
         db,
         { teamId: 'CORE', title: 'Prod fora do ar', statusId: 'to-do', priorityId: 'urgent' },
         ANA
      );

      // Envelhece o SLA: aplicado há 3 h, janela de 1 h → estourado.
      const past = new Date(Date.now() - 3 * 3_600_000);
      await db
         .update(issueT)
         .set({ slaAppliedAt: past, slaDueAt: new Date(past.getTime() + 3_600_000) })
         .where(eq(issueT.id, created.id));

      const before = (await db.select().from(issueT).where(eq(issueT.id, created.id)))[0];
      expect(
         slaState({
            dueDate: before.dueDate,
            slaDueAt: before.slaDueAt?.toISOString() ?? null,
            slaAppliedAt: before.slaAppliedAt?.toISOString() ?? null,
            statusCategory: 'started',
         })
      ).toBe('breached');

      await updateIssue(db, created.id, { priorityId: 'low' }, ANA);

      const after = (await db.select().from(issueT).where(eq(issueT.id, created.id)))[0];
      expect(after.priorityId).toBe('low');
      // O prazo NÃO foi afrouxado — o vencimento mais apertado prevalece.
      expect(after.slaDueAt!.getTime()).toBe(before.slaDueAt!.getTime());
      expect(
         slaState({
            dueDate: after.dueDate,
            slaDueAt: after.slaDueAt?.toISOString() ?? null,
            slaAppliedAt: after.slaAppliedAt?.toISOString() ?? null,
            statusCategory: 'started',
         })
      ).toBe('breached');
   });

   it('escalar a prioridade aperta o prazo (o caminho legítimo continua valendo)', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await seedUser(db, { name: 'Ana', email: ANA, role: 'Admin' });
      await setTeamSla(db, 'CORE', 'low', 720);
      await setTeamSla(db, 'CORE', 'urgent', 1);

      const created = await createIssue(
         db,
         { teamId: 'CORE', title: 'Lentidão', statusId: 'to-do', priorityId: 'low' },
         ANA
      );
      const before = (await db.select().from(issueT).where(eq(issueT.id, created.id)))[0];
      expect(before.slaDueAt).not.toBeNull();

      await updateIssue(db, created.id, { priorityId: 'urgent' }, ANA);
      const after = (await db.select().from(issueT).where(eq(issueT.id, created.id)))[0];
      expect(after.slaDueAt!.getTime()).toBeLessThan(before.slaDueAt!.getTime());
   });

   it('due date manual desliga o SLA e limpa o vencimento', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await seedUser(db, { name: 'Ana', email: ANA, role: 'Admin' });
      await setTeamSla(db, 'CORE', 'urgent', 2);

      const created = await createIssue(
         db,
         { teamId: 'CORE', title: 'Bug', statusId: 'to-do', priorityId: 'urgent' },
         ANA
      );
      const applied = (await db.select().from(issueT).where(eq(issueT.id, created.id)))[0];
      expect(applied.slaDueAt).not.toBeNull();

      await updateIssue(db, created.id, { dueDate: '2026-12-31' }, ANA);
      const after = (await db.select().from(issueT).where(eq(issueT.id, created.id)))[0];
      expect(after.slaAppliedAt).toBeNull();
      expect(after.slaDueAt).toBeNull();
   });
});
