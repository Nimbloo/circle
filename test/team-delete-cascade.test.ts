import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

// Storage S3/CDN mockado: a cascata remove os objetos dos anexos depois do commit.
const s3 = vi.hoisted(() => ({ deleteAsset: vi.fn(async (_key: string) => undefined) }));
vi.mock('@/lib/api/s3-assets', () => ({
   assetsConfigured: () => true,
   putAsset: vi.fn(),
   deleteAsset: s3.deleteAsset,
   assetKeyFromUrl: (url: string) =>
      url.startsWith('https://cdn.test/') ? url.slice('https://cdn.test/'.length) : null,
}));

import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import * as s from '@/db/schema';
import { deleteTeam, getTeamDeletionImpact } from '@/lib/api/teams';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { GET as impactRoute } from '@/app/api/v1/teams/[teamKey]/deletion-impact/route';
import { DELETE as deleteRoute } from '@/app/api/v1/teams/[teamKey]/route';

/**
 * Exclusão de time em cascata (paridade Linear, decisão de 2026-09-19): excluir um time
 * com conteúdo apaga o time E todo o conteúdo dele numa transação. Issues de OUTROS
 * times que apontavam para o conteúdo do time perdem só o vínculo.
 */

const ADMIN = 'ana@nimbloo.ai';
const MEMBER = 'bob@nimbloo.ai';

let db: Db;
let ana: string;
let bob: string;

function issueRow(id: string, teamId: string, extra: Partial<typeof s.issue.$inferInsert> = {}) {
   return {
      id,
      identifier: id.toUpperCase(),
      teamId,
      title: `Issue ${id}`,
      statusId: 'backlog',
      priorityId: 'low',
      createdById: ana,
      rank: `a${id}`,
      ...extra,
   };
}

/** DOOM tem conteúdo em TODAS as tabelas dependentes; KEEP aponta para ele. */
async function seedDoomedTeam() {
   s3.deleteAsset.mockClear();
   await seedTeam(db, 'DOOM', 'Doom');
   await seedTeam(db, 'KEEP', 'Keep');
   await seedTeam(db, 'SUB', 'Sub');
   await db.update(s.team).set({ parentId: 'DOOM' }).where(eq(s.team.id, 'SUB'));
   ana = await seedUser(db, {
      name: 'Ana',
      email: ADMIN,
      role: 'Admin',
      teamIds: ['DOOM', 'KEEP'],
   });
   bob = await seedUser(db, { name: 'Bob', email: MEMBER, teamIds: ['DOOM', 'KEEP'] });

   // Configuração do time.
   await db.insert(s.teamJoinRequest).values({ id: 'jr1', teamId: 'DOOM', userId: bob });
   await db.insert(s.teamSla).values({ teamId: 'DOOM', priorityId: 'high', hours: 4 });
   await db.insert(s.teamAutomation).values({
      id: 'au1',
      teamId: 'DOOM',
      name: 'r',
      trigger: 'issue.created_in_triage',
      action: 'add_label',
   });
   await db.insert(s.issueTemplate).values({ id: 'it1', teamId: 'DOOM', name: 'Bug' });
   await db.insert(s.projectTemplate).values({ id: 'pt1', teamId: 'DOOM', name: 'Launch' });

   // Projetos, ciclos, views, pastas.
   const project = (id: string, teamId: string) => ({
      id,
      name: id,
      statusId: 'proj-in-progress',
      priorityId: 'high',
      healthId: 'on-track',
      teamId,
   });
   await db.insert(s.project).values([project('dp1', 'DOOM'), project('kp1', 'KEEP')]);
   await db.insert(s.projectDetail).values({ projectId: 'dp1', summary: 'x' });
   await db.insert(s.projectMilestone).values({ id: 'dm1', projectId: 'dp1', name: 'M1' });
   await db
      .insert(s.projectUpdate)
      .values({ id: 'pu1', projectId: 'dp1', authorId: ana, health: 'on-track', blocks: '[]' });
   await db
      .insert(s.projectActivity)
      .values({ id: 'pa1', projectId: 'dp1', userId: ana, text: 'changed' });
   await db.insert(s.projectLabel).values({ projectId: 'dp1', labelId: 'bug' });
   await db
      .insert(s.projectResource)
      .values({ id: 'pr1', projectId: 'dp1', label: 'Doc', url: 'https://x' });
   await db
      .insert(s.projectSnapshot)
      .values({ projectId: 'dp1', date: '2026-09-01', scope: 1, started: 0, completed: 0 });
   await db.insert(s.projectDependency).values([
      { projectId: 'dp1', dependsOnId: 'kp1' },
      { projectId: 'kp1', dependsOnId: 'dp1' },
   ]);
   await db.insert(s.initiative).values({
      id: 'in1',
      slug: 'in1',
      name: 'Init',
      status: 'active',
      priorityId: 'high',
      healthId: 'on-track',
   });
   await db.insert(s.initiativeProject).values([
      { initiativeId: 'in1', projectId: 'dp1' },
      { initiativeId: 'in1', projectId: 'kp1' },
   ]);
   await db.insert(s.cycle).values({
      id: 'dc1',
      number: 1,
      name: 'C1',
      teamId: 'DOOM',
      status: 'current',
      startDate: '2026-09-01',
      endDate: '2026-09-14',
   });
   await db
      .insert(s.cycleSnapshot)
      .values({ cycleId: 'dc1', date: '2026-09-01', scope: 1, started: 0, completed: 0 });
   await db.insert(s.savedView).values({
      id: 'dv1',
      slug: 'dv1',
      name: 'V',
      type: 'issue',
      teamId: 'DOOM',
      ownerId: ana,
      filter: '{}',
   });
   await db.insert(s.documentFolder).values({ id: 'df1', teamId: 'DOOM', name: 'Specs' });
   await db.insert(s.teamDocument).values([
      { id: 'doc1', folderId: 'df1', name: 'RFC', creatorId: ana },
      { id: 'doc2', folderId: 'df1', name: 'ADR', creatorId: ana },
   ]);
   await db.insert(s.importJob).values({
      id: 'ij1',
      ownerId: ana,
      teamId: 'DOOM',
      source: 'csv',
      status: 'succeeded',
   });

   // Issues do time (d2 é sub-issue de d1) e de KEEP apontando para o conteúdo de DOOM.
   await db
      .insert(s.issue)
      .values([
         issueRow('d1', 'DOOM', { projectId: 'dp1', cycleId: 'dc1', milestoneId: 'dm1' }),
         issueRow('d2', 'DOOM'),
         issueRow('k1', 'KEEP'),
         issueRow('k2', 'KEEP', { projectId: 'dp1', cycleId: 'dc1', milestoneId: 'dm1' }),
         issueRow('k3', 'KEEP'),
      ]);
   await db
      .update(s.issue)
      .set({ parentId: 'd1' })
      .where(inArray(s.issue.id, ['d2', 'k1']));
   await db.insert(s.issueContent).values({ issueId: 'd1', description: 'desc' });
   await db.insert(s.issueLabel).values({ issueId: 'd1', labelId: 'bug' });
   await db.insert(s.issueAssignee).values({ issueId: 'd1', userId: ana });
   await db.insert(s.issueRelation).values([
      { id: 'r1', issueId: 'd1', relatedId: 'k3', kind: 'related' },
      { id: 'r2', issueId: 'k3', relatedId: 'd2', kind: 'blocked_by' },
      { id: 'r3', issueId: 'k1', relatedId: 'k3', kind: 'related' },
   ]);
   await db.insert(s.issuePrLink).values({ id: 'pl1', issueId: 'd1', title: 'PR', status: 'open' });
   await db.insert(s.issueSubscription).values({ issueId: 'd1', userId: bob });
   await db.insert(s.comment).values([
      { id: 'c1', issueId: 'd1', authorId: ana, body: '[]' },
      { id: 'c2', issueId: 'd1', authorId: bob, body: '[]', parentId: 'c1' },
   ]);
   await db.insert(s.commentReaction).values({ commentId: 'c1', emoji: '👍', userId: bob });
   const att = (id: string, commentId: string | null) => ({
      id,
      issueId: 'd1',
      commentId,
      uploadedById: ana,
      url: `https://cdn.test/attachments/${id}.png`,
      fileName: `${id}.png`,
      contentType: 'image/png',
      size: 10,
   });
   await db.insert(s.attachment).values([att('at1', null), att('at2', 'c1')]);
   await db
      .insert(s.activityEvent)
      .values({ id: 'ae1', issueId: 'd1', actorId: ana, event: 'created' });
   await db.insert(s.notification).values({
      id: 'n1',
      issueId: 'd1',
      actorId: ana,
      recipientId: bob,
      type: 'mention',
   });
   await db
      .insert(s.issueTriageSuggestion)
      .values({ issueId: 'd1', payload: {}, source: 'heuristic' });
   await db.insert(s.issueImport).values({ source: 'csv', externalId: 'X-1', issueId: 'd2' });
   await db.insert(s.favorite).values([
      { id: 'f1', userId: ana, entityType: 'issue', entityId: 'd1' },
      { id: 'f2', userId: ana, entityType: 'project', entityId: 'dp1' },
      { id: 'f3', userId: ana, entityType: 'view', entityId: 'dv1' },
      { id: 'f4', userId: ana, entityType: 'issue', entityId: 'k1' },
   ]);

   // Review que resolve a issue d1 (`review.resolves_identifier` não é FK — some a
   // issue, o review sobrevive com um identifier/título órfãos se ninguém limpar).
   await db.insert(s.review).values({
      id: 'x/y#1',
      title: 'Fix D1',
      status: 'open',
      repo: 'x/y',
      prNumber: 1,
      resolvesIdentifier: 'D1',
      resolvesTitle: 'Issue d1',
   });
}

const count = async (table: PgTable, where?: SQL) =>
   (
      await db
         .select({ n: sql<number>`count(*)::int` })
         .from(table)
         .where(where)
   )[0].n;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedDoomedTeam();
});
afterEach(() => __setTestDb(null));

describe('getTeamDeletionImpact', () => {
   it('conta issues (com sub-issues), projetos, ciclos, views, pastas e documentos', async () => {
      expect(await getTeamDeletionImpact(db, 'DOOM')).toEqual({
         issues: 2,
         projects: 1,
         cycles: 1,
         views: 1,
         folders: 1,
         documents: 2,
         attachments: 2,
         reviews: 1,
      });
      expect(await getTeamDeletionImpact(db, 'KEEP')).toMatchObject({ issues: 3, projects: 1 });
   });

   it('time inexistente → null', async () => {
      expect(await getTeamDeletionImpact(db, 'NOPE')).toBeNull();
   });
});

describe('deleteTeam apaga o time e todo o conteúdo em cascata', () => {
   it('nada do time sobra em nenhuma tabela dependente', async () => {
      expect(await deleteTeam(db, 'DOOM')).toBe(true);

      const doomIssues = ['d1', 'd2'];
      expect(await count(s.team, eq(s.team.id, 'DOOM'))).toBe(0);
      expect(await count(s.issue, eq(s.issue.teamId, 'DOOM'))).toBe(0);
      expect(await count(s.issueContent)).toBe(0);
      expect(await count(s.issueLabel)).toBe(0);
      expect(await count(s.issueAssignee)).toBe(0);
      expect(await count(s.issuePrLink)).toBe(0);
      expect(await count(s.issueSubscription)).toBe(0);
      expect(await count(s.comment)).toBe(0);
      expect(await count(s.commentReaction)).toBe(0);
      expect(await count(s.attachment)).toBe(0);
      expect(await count(s.activityEvent)).toBe(0);
      expect(await count(s.notification)).toBe(0);
      expect(await count(s.issueTriageSuggestion)).toBe(0);
      expect(await count(s.issueImport)).toBe(0);
      expect(
         await count(
            s.issueRelation,
            or(
               inArray(s.issueRelation.issueId, doomIssues),
               inArray(s.issueRelation.relatedId, doomIssues)
            )
         )
      ).toBe(0);

      expect(await count(s.project, eq(s.project.teamId, 'DOOM'))).toBe(0);
      expect(await count(s.projectDetail)).toBe(0);
      expect(await count(s.projectMilestone)).toBe(0);
      expect(await count(s.projectUpdate)).toBe(0);
      expect(await count(s.projectActivity)).toBe(0);
      expect(await count(s.projectLabel)).toBe(0);
      expect(await count(s.projectResource)).toBe(0);
      expect(await count(s.projectSnapshot)).toBe(0);
      expect(await count(s.projectDependency)).toBe(0);

      expect(await count(s.cycle)).toBe(0);
      expect(await count(s.cycleSnapshot)).toBe(0);
      expect(await count(s.savedView)).toBe(0);
      expect(await count(s.documentFolder)).toBe(0);
      expect(await count(s.teamDocument)).toBe(0);
      expect(await count(s.importJob)).toBe(0);

      expect(await count(s.teamJoinRequest)).toBe(0);
      expect(await count(s.teamSla)).toBe(0);
      expect(await count(s.teamAutomation)).toBe(0);
      expect(await count(s.issueTemplate)).toBe(0);
      expect(await count(s.projectTemplate)).toBe(0);
      expect(await count(s.teamMember, eq(s.teamMember.teamId, 'DOOM'))).toBe(0);

      // Favoritos que apontavam para o conteúdo do time somem; os demais ficam.
      expect((await db.select().from(s.favorite)).map((f) => f.id)).toEqual(['f4']);
      // Sub-time reancorado no avô (DOOM era de topo).
      const [sub] = await db.select().from(s.team).where(eq(s.team.id, 'SUB'));
      expect(sub.parentId).toBeNull();

      // O review NÃO é apagado (não pertence ao time) — só o vínculo órfão é limpo.
      const [review] = await db.select().from(s.review).where(eq(s.review.id, 'x/y#1'));
      expect(review).toBeDefined();
      expect(review.resolvesIdentifier).toBeNull();
      expect(review.resolvesTitle).toBeNull();
   });

   it('remove do storage os objetos dos anexos (da issue e dos comentários) depois do commit', async () => {
      await deleteTeam(db, 'DOOM');
      await vi.waitFor(() => expect(s3.deleteAsset).toHaveBeenCalledTimes(2));
      expect(s3.deleteAsset.mock.calls.map((c) => c[0]).sort()).toEqual([
         'attachments/at1.png',
         'attachments/at2.png',
      ]);
   });

   it('issues de outro time relacionadas ficam e perdem só o vínculo', async () => {
      await deleteTeam(db, 'DOOM');
      const keep = await db
         .select()
         .from(s.issue)
         .where(eq(s.issue.teamId, 'KEEP'))
         .orderBy(s.issue.id);
      expect(keep.map((i) => i.id)).toEqual(['k1', 'k2', 'k3']);
      const byId = Object.fromEntries(keep.map((i) => [i.id, i]));
      expect(byId.k1.parentId).toBeNull();
      expect(byId.k2).toMatchObject({ projectId: null, milestoneId: null, cycleId: null });
      // A relação entre duas issues de KEEP segue intacta.
      expect((await db.select().from(s.issueRelation)).map((r) => r.id)).toEqual(['r3']);
   });

   it('projeto de outro time na mesma initiative continua intocado', async () => {
      await deleteTeam(db, 'DOOM');
      expect(await count(s.project, eq(s.project.id, 'kp1'))).toBe(1);
      expect(await db.select().from(s.initiativeProject)).toEqual([
         { initiativeId: 'in1', projectId: 'kp1' },
      ]);
      expect(await count(s.initiative)).toBe(1);
   });

   it('publica depois do commit só eventos coarse + team deleted (sem rajada por issue)', async () => {
      const events: CircleEvent[] = [];
      const off = subscribe((e) => events.push(e));
      try {
         await deleteTeam(db, 'DOOM');
      } finally {
         off();
      }
      expect(events.filter((e) => e.entity === 'team')).toEqual([
         expect.objectContaining({ entity: 'team', action: 'deleted', id: 'DOOM', teamId: 'DOOM' }),
      ]);
      // Nenhum evento por issue/projeto/ciclo/view: só sinais coarse sem id.
      const perEntity = events.filter(
         (e) => e.id && ['issue', 'project', 'cycle', 'view', 'document'].includes(e.entity)
      );
      expect(perEntity).toEqual([]);
      expect(events).toContainEqual(
         expect.objectContaining({ entity: 'issue', action: 'updated', teamId: 'DOOM' })
      );
      expect(events).toContainEqual(
         expect.objectContaining({ entity: 'project', action: 'updated', teamId: 'DOOM' })
      );
      // As issues de KEEP que perderam vínculo recarregam pelo time delas.
      expect(events).toContainEqual(
         expect.objectContaining({ entity: 'issue', action: 'updated', teamId: 'KEEP' })
      );
      expect(events.some((e) => e.action === 'deleted' && e.entity === 'issue')).toBe(false);
   });

   it('a transação desfaz tudo se algo falhar no meio', async () => {
      // Falha forçada no meio da cascata (depois das issues, antes do time).
      await db.execute(sql`
         CREATE FUNCTION boom() RETURNS trigger AS $$
         BEGIN RAISE EXCEPTION 'boom'; END $$ LANGUAGE plpgsql`);
      await db.execute(sql`
         CREATE TRIGGER boom_folder BEFORE DELETE ON document_folder
         FOR EACH ROW EXECUTE FUNCTION boom()`);
      const events: CircleEvent[] = [];
      const off = subscribe((e) => events.push(e));
      try {
         await expect(deleteTeam(db, 'DOOM')).rejects.toThrow();
      } finally {
         off();
      }
      expect(await count(s.team, eq(s.team.id, 'DOOM'))).toBe(1);
      expect(await count(s.issue, eq(s.issue.teamId, 'DOOM'))).toBe(2);
      expect(await count(s.project, eq(s.project.teamId, 'DOOM'))).toBe(1);
      expect(await count(s.comment)).toBe(2);
      expect(await count(s.attachment)).toBe(2);
      const [k1] = await db.select().from(s.issue).where(eq(s.issue.id, 'k1'));
      expect(k1.parentId).toBe('d1');
      expect(await count(s.issueRelation)).toBe(3);
      expect(await count(s.teamMember, eq(s.teamMember.teamId, 'DOOM'))).toBe(2);
      const [review] = await db.select().from(s.review).where(eq(s.review.id, 'x/y#1'));
      expect(review.resolvesIdentifier).toBe('D1');
      // Nada publicado nem apagado do storage quando a transação volta.
      expect(events).toEqual([]);
      expect(s3.deleteAsset).not.toHaveBeenCalled();
   });

   it('time inexistente → false', async () => {
      expect(await deleteTeam(db, 'NOPE')).toBe(false);
   });
});

const params = (teamKey: string) => ({ params: Promise.resolve({ teamKey }) });
const req = (url: string, email: string, method = 'GET') =>
   new Request(url, { method, headers: { 'x-forwarded-email': email } });

describe('GET /teams/:key/deletion-impact', () => {
   it('admin recebe as contagens', async () => {
      const res = await impactRoute(
         req('http://x/api/v1/teams/DOOM/deletion-impact', ADMIN),
         params('DOOM')
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual({
         issues: 2,
         projects: 1,
         cycles: 1,
         views: 1,
         folders: 1,
         documents: 2,
         attachments: 2,
         reviews: 1,
      });
   });

   it('não-admin → 403', async () => {
      const res = await impactRoute(
         req('http://x/api/v1/teams/DOOM/deletion-impact', MEMBER),
         params('DOOM')
      );
      expect(res.status).toBe(403);
   });

   it('time inexistente → 404', async () => {
      const res = await impactRoute(
         req('http://x/api/v1/teams/NOPE/deletion-impact', ADMIN),
         params('NOPE')
      );
      expect(res.status).toBe(404);
   });
});

describe('DELETE /teams/:key com conteúdo', () => {
   it('apaga em cascata (sem 409) e registra o audit', async () => {
      const res = await deleteRoute(
         req('http://x/api/v1/teams/DOOM', ADMIN, 'DELETE'),
         params('DOOM')
      );
      expect(res.status).toBe(200);
      expect(await count(s.team, eq(s.team.id, 'DOOM'))).toBe(0);
      expect(await count(s.issue, eq(s.issue.teamId, 'DOOM'))).toBe(0);
      const audit = await db
         .select()
         .from(s.auditLog)
         .where(and(eq(s.auditLog.action, 'team.delete'), eq(s.auditLog.targetId, 'DOOM')));
      expect(audit).toHaveLength(1);
   });
});
