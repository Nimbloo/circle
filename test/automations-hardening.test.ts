import { describe, it, expect, vi, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { issue as issueT, team as teamT, teamAutomation } from '@/db/schema';
import { createIssue } from '@/lib/api/issues';
import {
   createAutomation,
   deleteAutomation,
   listTeamAutomations,
   runAutomations,
} from '@/lib/api/automations';
import { setTeamSla } from '@/lib/api/slas';

/**
 * Automações (auditoria v0.29.0): o motor derrubava a mutação que o disparou, a regra
 * padrão ressuscitava depois de apagada e `set_priority` trocava a prioridade sem
 * recalcular o SLA (ao contrário da UI).
 */

const ANA = 'ana@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ANA, role: 'Admin' });
   return db;
}

afterEach(() => vi.restoreAllMocks());

describe('motor — falha antes do laço não derruba o chamador', () => {
   it('runAutomations engole erro de qualquer etapa e devolve 0', async () => {
      const db = await setup();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Falha na PRIMEIRA query do motor (carregar a issue), antes do laço de regras.
      const broken = {
         ...db,
         select: () => {
            throw new Error('conexão caiu');
         },
      } as unknown as typeof db;

      await expect(
         runAutomations(broken, 'issue.status_changed', 'qualquer', { actorId: null })
      ).resolves.toBe(0);
   });

   it('o gatilho de uma mutação real não vaza erro do motor', async () => {
      const db = await setup();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Uma regra com status inexistente: a ação falha, o motor segue.
      await createAutomation(db, 'CORE', {
         name: 'Quebrada',
         trigger: 'issue.status_changed',
         action: 'set_status',
         config: { statusId: 'nao-existe' },
      });
      const created = await createIssue(
         db,
         { teamId: 'CORE', title: 'Segue vivo', statusId: 'to-do', priorityId: 'high' },
         ANA
      );
      expect(created.id).toBeTruthy();
   });
});

describe('regra padrão — apagar apaga de verdade', () => {
   it('não ressuscita depois de apagada', async () => {
      const db = await setup();
      const seeded = await listTeamAutomations(db, 'CORE');
      expect(seeded).toHaveLength(1);

      expect(await deleteAutomation(db, seeded[0].id)).toBe(true);

      // Leitura (que semeia de forma lazy) e execução do motor: nenhuma ressuscita.
      expect(await listTeamAutomations(db, 'CORE')).toEqual([]);
      await runAutomations(db, 'pr.merged', 'inexistente', { actorId: null });
      expect(await listTeamAutomations(db, 'CORE')).toEqual([]);

      const rows = await db.select().from(teamAutomation).where(eq(teamAutomation.teamId, 'CORE'));
      expect(rows).toEqual([]);
   });

   it('semeia uma única vez, mesmo com leituras concorrentes', async () => {
      const db = await setup();
      await db.update(teamT).set({ automationsSeededAt: null }).where(eq(teamT.id, 'CORE'));
      await db.delete(teamAutomation).where(eq(teamAutomation.teamId, 'CORE'));

      await Promise.all([
         listTeamAutomations(db, 'CORE'),
         listTeamAutomations(db, 'CORE'),
         listTeamAutomations(db, 'CORE'),
      ]);
      expect(await listTeamAutomations(db, 'CORE')).toHaveLength(1);
   });
});

describe('set_priority — recalcula o SLA como a UI', () => {
   it('a issue fica com a prioridade nova E o prazo da prioridade nova', async () => {
      const db = await setup();
      await setTeamSla(db, 'CORE', 'low', 720);
      await setTeamSla(db, 'CORE', 'urgent', 1);

      await createAutomation(db, 'CORE', {
         name: 'Bug entra urgente',
         trigger: 'issue.status_changed',
         action: 'set_priority',
         config: { priorityId: 'urgent' },
      });

      const created = await createIssue(
         db,
         { teamId: 'CORE', title: 'Fila parada', statusId: 'to-do', priorityId: 'low' },
         ANA
      );
      const before = (await db.select().from(issueT).where(eq(issueT.id, created.id)))[0];
      expect(before.slaDueAt).not.toBeNull();

      await runAutomations(db, 'issue.status_changed', created.id, {
         actorId: null,
         toCategory: 'unstarted',
      });

      const after = (await db.select().from(issueT).where(eq(issueT.id, created.id)))[0];
      expect(after.priorityId).toBe('urgent');
      expect(after.slaAppliedAt).not.toBeNull();
      // Prazo apertado para a janela de 1 h (antes ficava com o de 720 h).
      expect(after.slaDueAt!.getTime()).toBeLessThan(before.slaDueAt!.getTime());
      expect(after.dueDate).not.toBe(before.dueDate);
   });

   it('due date manual não é sobrescrito pela automação', async () => {
      const db = await setup();
      await setTeamSla(db, 'CORE', 'urgent', 1);
      await createAutomation(db, 'CORE', {
         name: 'Bug entra urgente',
         trigger: 'issue.status_changed',
         action: 'set_priority',
         config: { priorityId: 'urgent' },
      });

      const created = await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Com data manual',
            statusId: 'to-do',
            priorityId: 'low',
            dueDate: '2026-12-31',
         },
         ANA
      );
      await runAutomations(db, 'issue.status_changed', created.id, {
         actorId: null,
         toCategory: 'unstarted',
      });

      const after = (await db.select().from(issueT).where(eq(issueT.id, created.id)))[0];
      expect(after.priorityId).toBe('urgent');
      expect(after.dueDate).toBe('2026-12-31');
      expect(after.slaAppliedAt).toBeNull();
      expect(after.slaDueAt).toBeNull();
   });
});
