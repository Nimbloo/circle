import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { issue, issueRelation, cycle, project, team, activityEvent } from '@/db/schema';
import { createIssue, updateIssue, deleteIssue, listIssues, getIssue } from '@/lib/api/issues';
import { addRelation, removeRelation, getIssueDetail } from '@/lib/api/issue-detail';

const ME = 'ana.silva@nimbloo.ai';
const OTHER = 'lia.costa@nimbloo.ai';

type Db = Awaited<ReturnType<typeof makeTestDb>>;

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const meId = await seedUser(db, { name: 'Ana', email: ME, teamIds: ['CORE'] });
   const otherId = await seedUser(db, { name: 'Lia', email: OTHER, teamIds: ['CORE'] });
   return { db, meId, otherId };
}

function top(db: Db, title: string, extra: Partial<Parameters<typeof createIssue>[1]> = {}) {
   return createIssue(
      db,
      { teamId: 'CORE', title, statusId: 'to-do', priorityId: 'high', ...extra },
      ME
   );
}

/** UPDATE de backfill da migration de parent_id (extraído do arquivo real). */
function backfillSql(): string {
   const dir = join(process.cwd(), 'db/migrations');
   const file = readdirSync(dir).find((f) => f.endsWith('.sql') && f.includes('parent'));
   if (!file) throw new Error('migration de parent_id não encontrada');
   const stmt = readFileSync(join(dir, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .find((s) => s.includes('UPDATE "issue" AS c'));
   if (!stmt) throw new Error('UPDATE de backfill não encontrado');
   return stmt;
}

describe('sub-issues (#95) — pai canônico em issue.parent_id', () => {
   it('createIssue com parentId herda team/priority/project (labels não) e assignee só se o criador é o assignee do pai', async () => {
      const { db, meId, otherId } = await setup();
      await db.insert(project).values({
         id: 'P-1',
         name: 'Projeto',
         statusId: 'proj-in-progress',
         priorityId: 'high',
         healthId: 'on-track',
         teamId: 'CORE',
         percentComplete: 0,
         startDate: '2026-01-01',
         targetDate: '2026-06-01',
         createdAt: new Date(),
         updatedAt: new Date(),
      });
      const parent = await top(db, 'Pai', {
         projectId: 'P-1',
         labelIds: ['bug'],
         assigneeId: meId,
         priorityId: 'urgent',
      });

      const child = await createIssue(db, { parentId: parent.id, title: 'Filha' }, ME);
      expect(child.parentId).toBe(parent.id);
      expect(child.parentIdentifier).toBe(parent.identifier);
      expect(child.teamId).toBe('CORE');
      expect(child.priority.id).toBe('urgent');
      expect(child.project?.id).toBe('P-1');
      expect(child.labels).toEqual([]);
      expect(child.status.id).toBe('to-do'); // default: 1º 'unstarted'
      expect(child.assignee?.id).toBe(meId); // criador == assignee do pai → herda

      // Outro criador: NÃO herda o assignee.
      const child2 = await createIssue(db, { parentId: parent.id, title: 'Filha 2' }, OTHER);
      expect(child2.assignee).toBeNull();
      // Filha 3: informou assignee explicitamente → respeita; otherId ≠ assignee do pai.
      const child3 = await createIssue(
         db,
         { parentId: parent.id, title: 'Filha 3', assigneeId: otherId, priorityId: 'low' },
         ME
      );
      expect(child3.assignee?.id).toBe(otherId);
      expect(child3.priority.id).toBe('low');

      // Activity `parent` na filha.
      const events = await db
         .select()
         .from(activityEvent)
         .where(eq(activityEvent.issueId, child.id));
      expect(events.map((e) => e.event)).toContain('parent');
      expect(events.find((e) => e.event === 'parent')?.text).toBe(
         `set parent to ${parent.identifier}`
      );
   });

   it('sem parentId, teamId/statusId/priorityId continuam obrigatórios (400)', async () => {
      const { db } = await setup();
      await expect(createIssue(db, { title: 'Solta' }, ME)).rejects.toMatchObject({ status: 400 });
      await expect(createIssue(db, { parentId: 'nope', title: 'Órfã' }, ME)).rejects.toMatchObject({
         status: 400,
      });
   });

   it('cycleId herda do pai só quando o cycle está current', async () => {
      const { db } = await setup();
      const now = new Date();
      await db.insert(cycle).values([
         {
            id: 'C-cur',
            number: 1,
            name: 'Cycle 1',
            teamId: 'CORE',
            status: 'current',
            startDate: '2026-01-01',
            endDate: '2026-01-14',
            capacity: 0,
         },
         {
            id: 'C-old',
            number: 2,
            name: 'Cycle 2',
            teamId: 'CORE',
            status: 'completed',
            startDate: '2025-12-01',
            endDate: '2025-12-14',
            capacity: 0,
         },
      ]);
      void now;
      const pCur = await top(db, 'Pai atual', { cycleId: 'C-cur' });
      const pOld = await top(db, 'Pai antigo', { cycleId: 'C-old' });
      const c1 = await createIssue(db, { parentId: pCur.id, title: 'f1' }, ME);
      const c2 = await createIssue(db, { parentId: pOld.id, title: 'f2' }, ME);
      expect(c1.cycleId).toBe('C-cur');
      expect(c2.cycleId).toBe('');
   });

   it('updateIssue move e remove o pai com activity, e o detail expõe parent/subIssues', async () => {
      const { db } = await setup();
      const a = await top(db, 'A');
      const b = await top(db, 'B');
      const c = await top(db, 'C');

      await updateIssue(db, c.id, { parentId: a.id }, ME);
      let detailA = await getIssueDetail(db, a.id);
      expect(detailA?.subIssueIds).toEqual([c.id]);
      expect(detailA?.subIssues.map((s) => s.identifier)).toEqual([c.identifier]);
      let detailC = await getIssueDetail(db, c.id);
      expect(detailC?.parent).toEqual({ id: a.id, identifier: a.identifier, title: 'A' });

      // Move para B
      await updateIssue(db, c.id, { parentId: b.id }, ME);
      detailA = await getIssueDetail(db, a.id);
      expect(detailA?.subIssues).toEqual([]);
      const detailB = await getIssueDetail(db, b.id);
      expect(detailB?.subIssueIds).toEqual([c.id]);

      // Remove
      await updateIssue(db, c.id, { parentId: null }, ME);
      detailC = await getIssueDetail(db, c.id);
      expect(detailC?.parent).toBeNull();
      expect((await getIssue(db, c.id))?.parentId).toBeNull();

      const texts = (await db.select().from(activityEvent).where(eq(activityEvent.issueId, c.id)))
         .filter((e) => e.event === 'parent')
         .map((e) => e.text);
      expect(texts).toEqual([
         `set parent to ${a.identifier}`,
         `set parent to ${b.identifier}`,
         'removed parent',
      ]);
   });

   it('rejeita auto-pai e ciclo (ancestral virando filha) com 400', async () => {
      const { db } = await setup();
      const a = await top(db, 'A');
      const b = await createIssue(db, { parentId: a.id, title: 'B' }, ME);
      const c = await createIssue(db, { parentId: b.id, title: 'C' }, ME);

      await expect(updateIssue(db, a.id, { parentId: a.id }, ME)).rejects.toMatchObject({
         status: 400,
      });
      // A é avó de C: A não pode virar filha de C.
      await expect(updateIssue(db, a.id, { parentId: c.id }, ME)).rejects.toMatchObject({
         status: 400,
      });
      await expect(updateIssue(db, a.id, { parentId: b.id }, ME)).rejects.toMatchObject({
         status: 400,
      });
      // Pai inexistente
      await expect(updateIssue(db, a.id, { parentId: 'nope' }, ME)).rejects.toMatchObject({
         status: 400,
      });
      // Nada mudou
      expect((await getIssue(db, a.id))?.parentId).toBeNull();
   });

   it('rollup de filhas diretas por GROUP BY parent_id (netas não contam)', async () => {
      const { db } = await setup();
      const parent = await top(db, 'Pai');
      const c1 = await createIssue(db, { parentId: parent.id, title: 'c1' }, ME);
      await createIssue(db, { parentId: parent.id, title: 'c2' }, ME);
      const c3 = await createIssue(db, { parentId: parent.id, title: 'c3' }, ME);
      await createIssue(db, { parentId: c1.id, title: 'neta' }, ME);
      await updateIssue(db, c1.id, { statusId: 'done' }, ME);
      await updateIssue(db, c3.id, { statusId: 'shipped' }, ME);

      const list = await listIssues(db, { team: 'CORE' });
      const p = list.find((i) => i.id === parent.id)!;
      expect(p.subIssueCount).toBe(3);
      expect(p.subIssueDoneCount).toBe(2);
      const child1 = list.find((i) => i.id === c1.id)!;
      expect(child1.subIssueCount).toBe(1);
      expect(child1.subIssueDoneCount).toBe(0);
      expect(child1.parentIdentifier).toBe(parent.identifier);
   });

   it('deleteIssue do pai desvincula as filhas (parent_id = NULL)', async () => {
      const { db } = await setup();
      const parent = await top(db, 'Pai');
      const child = await createIssue(db, { parentId: parent.id, title: 'Filha' }, ME);
      expect(await deleteIssue(db, parent.id)).toBe(true);
      const after = await getIssue(db, child.id);
      expect(after?.parentId).toBeNull();
      expect(after?.parentIdentifier).toBeNull();
   });

   it('addRelation/removeRelation(kind=sub) delegam para parent_id (compat do cliente antigo)', async () => {
      const { db } = await setup();
      const parent = await top(db, 'Pai');
      const child = await top(db, 'Filha');

      const detail = await addRelation(db, parent.id, child.id, 'sub', ME);
      expect(detail?.subIssueIds).toEqual([child.id]);
      expect((await getIssue(db, child.id))?.parentId).toBe(parent.id);
      // Nada foi escrito em issue_relation
      const rels = await db.select().from(issueRelation).where(eq(issueRelation.kind, 'sub'));
      expect(rels).toEqual([]);

      const removed = await removeRelation(db, parent.id, child.id, 'sub', ME);
      expect(removed?.subIssueIds).toEqual([]);
      expect((await getIssue(db, child.id))?.parentId).toBeNull();
   });

   it('backfill da migration é idempotente e escolhe o pai mais antigo em conflito', async () => {
      const { db } = await setup();
      const older = await top(db, 'Pai antigo');
      // garante ordem temporal explícita
      await db
         .update(issue)
         .set({ createdAt: new Date('2026-01-01T00:00:00Z') })
         .where(eq(issue.id, older.id));
      const newer = await top(db, 'Pai novo');
      await db
         .update(issue)
         .set({ createdAt: new Date('2026-02-01T00:00:00Z') })
         .where(eq(issue.id, newer.id));
      const child = await top(db, 'Filha');
      const solo = await top(db, 'Filha única');
      await db.insert(issueRelation).values([
         { id: randomUUID(), issueId: newer.id, relatedId: child.id, kind: 'sub' },
         { id: randomUUID(), issueId: older.id, relatedId: child.id, kind: 'sub' },
         { id: randomUUID(), issueId: older.id, relatedId: solo.id, kind: 'sub' },
         { id: randomUUID(), issueId: solo.id, relatedId: solo.id, kind: 'sub' }, // auto: ignorada
         { id: randomUUID(), issueId: older.id, relatedId: newer.id, kind: 'related' },
      ]);

      const stmt = backfillSql();
      await db.execute(sql.raw(stmt));
      expect((await getIssue(db, child.id))?.parentId).toBe(older.id);
      expect((await getIssue(db, solo.id))?.parentId).toBe(older.id);
      expect((await getIssue(db, newer.id))?.parentId).toBeNull();

      // 2ª rodada: nada muda (inclusive quem já foi movido pela app depois do backfill).
      await updateIssue(db, solo.id, { parentId: newer.id }, ME);
      await db.execute(sql.raw(stmt));
      expect((await getIssue(db, child.id))?.parentId).toBe(older.id);
      expect((await getIssue(db, solo.id))?.parentId).toBe(newer.id);
   });

   describe('automações por time', () => {
      it('auto_close_parent: última filha concluída conclui o pai (e sobe a árvore)', async () => {
         const { db } = await setup();
         await db.update(team).set({ autoCloseParent: true }).where(eq(team.id, 'CORE'));
         const grand = await top(db, 'Avó');
         const parent = await createIssue(db, { parentId: grand.id, title: 'Pai' }, ME);
         const c1 = await createIssue(db, { parentId: parent.id, title: 'c1' }, ME);
         const c2 = await createIssue(db, { parentId: parent.id, title: 'c2' }, ME);

         await updateIssue(db, c1.id, { statusId: 'done' }, ME);
         expect((await getIssue(db, parent.id))?.status.id).toBe('to-do'); // ainda falta c2

         await updateIssue(db, c2.id, { statusId: 'canceled' }, ME); // canceled conta como done
         const p = await getIssue(db, parent.id);
         expect(p?.status.category).toBe('completed');
         expect(p?.status.id).toBe('done'); // 1º status 'completed' (c2 foi cancelada)
         const g = await getIssue(db, grand.id);
         expect(g?.status.category).toBe('completed'); // pai era a única filha da avó

         const events = await db
            .select()
            .from(activityEvent)
            .where(eq(activityEvent.issueId, parent.id));
         expect(
            events.some((e) => e.event === 'status' && /automatically/.test(e.text ?? ''))
         ).toBe(true);
      });

      it('auto_close_children: concluir o pai conclui as filhas abertas (canceladas ficam)', async () => {
         const { db } = await setup();
         await db.update(team).set({ autoCloseChildren: true }).where(eq(team.id, 'CORE'));
         const parent = await top(db, 'Pai');
         const c1 = await createIssue(db, { parentId: parent.id, title: 'c1' }, ME);
         const c2 = await createIssue(db, { parentId: parent.id, title: 'c2' }, ME);
         const grandchild = await createIssue(db, { parentId: c1.id, title: 'neta' }, ME);
         await updateIssue(db, c2.id, { statusId: 'canceled' }, ME);

         await updateIssue(db, parent.id, { statusId: 'shipped' }, ME);
         expect((await getIssue(db, c1.id))?.status.id).toBe('shipped');
         expect((await getIssue(db, grandchild.id))?.status.id).toBe('shipped');
         expect((await getIssue(db, c2.id))?.status.id).toBe('canceled');
      });

      it('sem os toggles nada acontece; troca dentro da mesma categoria também não dispara', async () => {
         const { db } = await setup();
         const parent = await top(db, 'Pai');
         const child = await createIssue(db, { parentId: parent.id, title: 'c' }, ME);
         await updateIssue(db, child.id, { statusId: 'done' }, ME);
         expect((await getIssue(db, parent.id))?.status.id).toBe('to-do');

         await db.update(team).set({ autoCloseChildren: true }).where(eq(team.id, 'CORE'));
         await updateIssue(db, parent.id, { statusId: 'done' }, ME);
         const other = await createIssue(db, { parentId: parent.id, title: 'c2' }, ME);
         // done → shipped: mesma categoria, não re-dispara para a filha nova
         await updateIssue(db, parent.id, { statusId: 'shipped' }, ME);
         expect((await getIssue(db, other.id))?.status.id).toBe('to-do');
      });
   });
});
