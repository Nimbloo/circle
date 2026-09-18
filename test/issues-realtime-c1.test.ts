import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedWorkspaceFixture, type WorkspaceFixture } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import {
   issue as issueT,
   team as teamT,
   project as projectT,
   label as labelT,
   issueLabel,
} from '@/db/schema';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import {
   addLabel,
   createIssue,
   deleteIssue,
   listIssues,
   reorderIssue,
   updateIssue,
} from '@/lib/api/issues';
import { commitImport } from '@/lib/api/import';
import * as automations from '@/lib/api/automations';
import { firstRank } from '@/lib/api/rank';

let db: Db;
let fx: WorkspaceFixture;
let eventos: CircleEvent[];
let parar: () => void;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   fx = await seedWorkspaceFixture(db);
   // A fixture grava rank 'a3c' (formato do mock), que o LexoRank não parseia.
   await db.update(issueT).set({ rank: firstRank() }).where(eq(issueT.id, fx.issueId));
   // …e semeia CORE-1 sem avançar o contador do time.
   await db.update(teamT).set({ issueSeq: 1 }).where(eq(teamT.id, fx.teamId));
   await db.insert(projectT).values({
      id: 'P-2',
      name: 'Outro',
      statusId: 'proj-in-progress',
      iconKey: null,
      percentComplete: 0,
      startDate: null,
      targetDate: null,
      leadId: fx.ownerId,
      priorityId: 'high',
      healthId: 'on-track',
      teamId: fx.teamId,
      initiativeId: null,
      healthUpdatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
   });
   eventos = [];
   parar = subscribe((e) => eventos.push(e));
});
afterEach(() => {
   parar();
   __setTestDb(null);
   vi.restoreAllMocks();
});

const ids = (entity: string) =>
   eventos.filter((e) => e.entity === entity && e.id).map((e) => e.id as string);

describe('rollups publicam project/cycle (#8)', () => {
   it('trocar o projeto avisa o antigo e o novo', async () => {
      await updateIssue(db, fx.issueId, { projectId: 'P-2' }, fx.ownerEmail);
      expect(new Set(ids('project'))).toEqual(new Set([fx.projectId, 'P-2']));
   });

   it('mudar o status avisa o projeto e o ciclo', async () => {
      await updateIssue(db, fx.issueId, { statusId: 'done' }, fx.ownerEmail);
      expect(ids('project')).toContain(fx.projectId);
      expect(ids('cycle')).toContain(fx.cycleId);
      const issueEv = eventos.find((e) => e.entity === 'issue' && e.id === fx.issueId);
      expect(issueEv?.teamId).toBe(fx.teamId);
   });

   it('mudar só o título não publica rollup', async () => {
      await updateIssue(db, fx.issueId, { title: 'Novo' }, fx.ownerEmail);
      expect(ids('project')).toEqual([]);
      expect(ids('cycle')).toEqual([]);
   });

   it('deleteIssue avisa o pai, o projeto e o ciclo', async () => {
      const filha = await createIssue(
         db,
         { title: 'Filha', parentId: fx.issueId, projectId: fx.projectId, cycleId: fx.cycleId },
         fx.ownerEmail
      );
      eventos = [];
      await deleteIssue(db, filha.id, fx.ownerEmail);
      expect(ids('issue')).toContain(fx.issueId);
      expect(ids('project')).toContain(fx.projectId);
      expect(ids('cycle')).toContain(fx.cycleId);
   });
});

describe('updateIssue com efeitos pós-commit (#10)', () => {
   it('falha de automação não devolve erro nem engole o evento', async () => {
      vi.spyOn(automations, 'runAutomations').mockRejectedValue(new Error('boom'));
      const dto = await updateIssue(db, fx.issueId, { statusId: 'done' }, fx.ownerEmail);
      expect(dto?.status.id).toBe('done');
      expect(ids('issue')).toContain(fx.issueId);
   });
});

describe('import silencioso (#7, #12)', () => {
   it('import de N linhas publica UM evento de issue (coarse) e label nova publica', async () => {
      const csv = [
         'ID,Title,Labels',
         ...Array.from({ length: 5 }, (_, i) => `X-${i},Linha ${i},Nova Label`),
      ].join('\n');
      const res = await commitImport(
         db,
         {
            source: 'csv',
            csv,
            mapping: { externalId: 'ID', title: 'Title', labels: 'Labels' },
            teamId: fx.teamId,
            createMissingLabels: true,
         },
         fx.ownerEmail
      );
      expect(res.created).toBe(5);
      const issueEvents = eventos.filter((e) => e.entity === 'issue');
      expect(issueEvents).toHaveLength(1);
      expect(issueEvents[0].id).toBeUndefined();
      expect(issueEvents[0].teamId).toBe(fx.teamId);
      expect(eventos.filter((e) => e.entity === 'label').map((e) => e.action)).toEqual(['created']);
   });
});

describe('lexorank (#25)', () => {
   it('reorder com vizinhos empatados não lança', async () => {
      const a = await createIssue(
         db,
         { teamId: fx.teamId, title: 'A', priorityId: 'low' },
         fx.ownerEmail
      );
      const b = await createIssue(
         db,
         { teamId: fx.teamId, title: 'B', priorityId: 'low' },
         fx.ownerEmail
      );
      const c = await createIssue(
         db,
         { teamId: fx.teamId, title: 'C', priorityId: 'low' },
         fx.ownerEmail
      );
      await db.update(issueT).set({ rank: a.rank }).where(eq(issueT.id, b.id));
      const moved = await reorderIssue(db, c.id, a.id, b.id, fx.ownerEmail);
      expect(moved).not.toBeNull();
   });

   it('reorder com vizinhos invertidos não lança', async () => {
      const a = await createIssue(
         db,
         { teamId: fx.teamId, title: 'A', priorityId: 'low' },
         fx.ownerEmail
      );
      const b = await createIssue(
         db,
         { teamId: fx.teamId, title: 'B', priorityId: 'low' },
         fx.ownerEmail
      );
      const c = await createIssue(
         db,
         { teamId: fx.teamId, title: 'C', priorityId: 'low' },
         fx.ownerEmail
      );
      const moved = await reorderIssue(db, c.id, b.id, a.id, fx.ownerEmail);
      expect(moved).not.toBeNull();
   });

   it('criações concorrentes não repetem rank', async () => {
      const criadas = await Promise.all(
         Array.from({ length: 6 }, (_, i) =>
            createIssue(db, { teamId: fx.teamId, title: `T${i}`, priorityId: 'low' }, fx.ownerEmail)
         )
      );
      expect(new Set(criadas.map((c) => c.rank)).size).toBe(6);
   });

   it('paginação keyset por (rank, id) não pula empates; cursor antigo segue aceito', async () => {
      for (let i = 0; i < 4; i++) {
         await createIssue(
            db,
            { teamId: fx.teamId, title: `E${i}`, priorityId: 'low' },
            fx.ownerEmail
         );
      }
      // todas empatadas no mesmo rank
      await db.update(issueT).set({ rank: '0|zzz:' });
      const all: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 10; page++) {
         const rows = await listIssues(db, { team: fx.teamId, limit: 2, cursor });
         if (rows.length === 0) break;
         all.push(...rows.map((r) => r.id));
         const last = rows[rows.length - 1];
         cursor = `${last.rank}~${last.id}`;
      }
      expect(all).toHaveLength(5);
      expect(new Set(all).size).toBe(5);

      // cursor antigo (só rank) continua aceito
      const legacy = await listIssues(db, { team: fx.teamId, limit: 10, cursor: '0|zzz:' });
      expect(legacy).toEqual([]);
   });
});

describe('label exclusiva (#32)', () => {
   it('adicionar label de grupo mantém uma por grupo', async () => {
      await db
         .insert(labelT)
         .values({ id: 'feature-x', name: 'Feature', color: 'blue', groupId: 'kind' });
      await addLabel(db, fx.issueId, 'bug', fx.ownerEmail);
      await addLabel(db, fx.issueId, 'feature-x', fx.ownerEmail);
      const links = await db.select().from(issueLabel).where(eq(issueLabel.issueId, fx.issueId));
      expect(links.map((l) => l.labelId)).toEqual(['feature-x']);
   });
});
