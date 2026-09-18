import { describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser, seedWorkspaceFixture } from './helpers/fixtures';
import { activityEvent, comment, issue, projectSnapshot } from '@/db/schema';
import { listMyActivity } from '@/lib/api/issue-detail';
import { listMembers } from '@/lib/api/members';
import { listTeams } from '@/lib/api/teams';
import { search } from '@/lib/api/search';
import { bootstrapWorkspace } from '@/lib/api/workspace';
import { __setTestDb } from '@/db';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { isAdmin } from '@/lib/api/auth';

function rowsOf(value: unknown): Record<string, unknown>[] {
   if (Array.isArray(value)) return value as Record<string, unknown>[];
   return ((value as { rows?: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];
}

describe('Frente C2 — limites e escopo SQL', () => {
   it('limita e ordena o feed de atividade do usuário', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const userId = await seedUser(db, {
         name: 'Ana',
         email: 'ana@nimbloo.ai',
         teamIds: ['CORE'],
      });
      await db.insert(issue).values([
         {
            id: 'i-activity-1',
            identifier: 'CORE-101',
            teamId: 'CORE',
            title: 'A',
            statusId: 'in-progress',
            priorityId: 'high',
            createdById: userId,
            rank: 'a',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
         },
         {
            id: 'i-activity-2',
            identifier: 'CORE-102',
            teamId: 'CORE',
            title: 'B',
            statusId: 'in-progress',
            priorityId: 'high',
            createdById: userId,
            rank: 'b',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
         },
         {
            id: 'i-activity-3',
            identifier: 'CORE-103',
            teamId: 'CORE',
            title: 'C',
            statusId: 'in-progress',
            priorityId: 'high',
            createdById: userId,
            rank: 'c',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
         },
      ]);
      await db.insert(activityEvent).values([
         {
            id: 'e-1',
            issueId: 'i-activity-1',
            actorId: userId,
            event: 'created',
            createdAt: new Date('2026-01-01T00:00:01Z'),
         },
         {
            id: 'e-2',
            issueId: 'i-activity-2',
            actorId: userId,
            event: 'updated',
            createdAt: new Date('2026-01-01T00:00:02Z'),
         },
         {
            id: 'e-3',
            issueId: 'i-activity-3',
            actorId: userId,
            event: 'updated',
            createdAt: new Date('2026-01-01T00:00:03Z'),
         },
      ]);

      const result = await listMyActivity(db, userId, 2);

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.id)).toEqual(['e-3', 'e-2']);
   });

   it('aplica teamIds no SQL lógico das listagens de membros e times', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await seedTeam(db, 'OPS');
      await seedUser(db, { name: 'Core', email: 'core@nimbloo.ai', teamIds: ['CORE'] });
      await seedUser(db, { name: 'Ops', email: 'ops@nimbloo.ai', teamIds: ['OPS'] });

      expect((await listMembers(db, { teamIds: ['CORE'] })).map((member) => member.email)).toEqual([
         'core@nimbloo.ai',
      ]);
      expect((await listTeams(db, { teamIds: ['CORE'] })).map((team) => team.id)).toEqual(['CORE']);
   });
});

describe('Frente C2 — usuário por request (#40)', () => {
   it('resolve app_user uma vez e reutiliza no restante do handler', async () => {
      const db = await makeTestDb();
      await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', role: 'Admin' });
      __setTestDb(db);
      const selectSpy = vi.spyOn(db, 'select');
      try {
         const req = new Request('http://x/api/v1/test', {
            headers: { 'x-forwarded-email': 'ana@nimbloo.ai' },
         });
         await handle(async () => {
            const email = await requireEmail(req);
            await getOrCreateUser(db, email);
            expect(await isAdmin(email, db)).toBe(true);
            return new Response('ok');
         }, req);

         expect(selectSpy).toHaveBeenCalledTimes(1);
      } finally {
         __setTestDb(null);
      }
   });
});

describe('Frente C2 — busca indexada', () => {
   it('separa os ramos indexado e comentário e respeita o limite final', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const userId = await seedUser(db, {
         name: 'Ana',
         email: 'ana@nimbloo.ai',
         teamIds: ['CORE'],
      });
      await db.insert(issue).values({
         id: 'i-indexed',
         identifier: 'CORE-201',
         teamId: 'CORE',
         title: 'telemetria indexada',
         statusId: 'in-progress',
         priorityId: 'high',
         createdById: userId,
         rank: 'a',
      });
      await db.insert(issue).values([
         {
            id: 'i-comment-1',
            identifier: 'CORE-202',
            teamId: 'CORE',
            title: 'A',
            statusId: 'in-progress',
            priorityId: 'high',
            createdById: userId,
            rank: 'b',
         },
         {
            id: 'i-comment-2',
            identifier: 'CORE-203',
            teamId: 'CORE',
            title: 'B',
            statusId: 'in-progress',
            priorityId: 'high',
            createdById: userId,
            rank: 'c',
         },
      ]);
      await db.insert(comment).values([
         {
            id: 'comment-1',
            issueId: 'i-comment-1',
            authorId: userId,
            body: 'telemetria no comentário',
         },
         {
            id: 'comment-2',
            issueId: 'i-comment-2',
            authorId: userId,
            body: 'telemetria no comentário',
         },
      ]);

      const executeSpy = vi.spyOn(db, 'execute');
      const result = await search(db, { q: 'telemetria', types: ['issue'], limit: 2 });
      const dialect = (
         db as unknown as { dialect: { sqlToQuery(query: unknown): { sql: string } } }
      ).dialect;
      const sqlTexts = executeSpy.mock.calls.map(([query]) =>
         dialect.sqlToQuery(query).sql.toUpperCase()
      );

      expect(result.groups[0].items).toHaveLength(2);
      expect(result.groups[0].items[0].id).toBe('i-indexed');
      expect(sqlTexts.some((text) => text.includes('UNION'))).toBe(true);
      expect(sqlTexts.some((text) => (text.match(/LIMIT/g)?.length ?? 0) >= 4)).toBe(true);
   });
});

describe('Frente C2 — housekeeping do bootstrap', () => {
   it('não regrava rollover e snapshot duas vezes no mesmo dia por time', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-18T12:00:00Z'));
      try {
         const db = await makeTestDb();
         const fixture = await seedWorkspaceFixture(db);

         await bootstrapWorkspace(db, fixture.ownerEmail);
         const before = await db
            .select()
            .from(projectSnapshot)
            .where(eq(projectSnapshot.projectId, fixture.projectId));
         await db.update(issue).set({ statusId: 'done' }).where(eq(issue.id, fixture.issueId));

         await bootstrapWorkspace(db, fixture.ownerEmail);
         const after = await db
            .select()
            .from(projectSnapshot)
            .where(eq(projectSnapshot.projectId, fixture.projectId));

         expect(after[0].completed).toBe(before[0].completed);
      } finally {
         vi.useRealTimers();
      }
   });
});

describe('Frente C2 — índices e integridade', () => {
   it('cria a FK de milestone e os índices das FKs de alta frequência', async () => {
      const db = await makeTestDb();
      const constraints = rowsOf(
         await db.execute(
            sql`SELECT conname, confdeltype FROM pg_constraint WHERE conname = 'issue_milestone_id_project_milestone_id_fk'`
         )
      );
      expect(constraints).toHaveLength(1);
      expect(constraints[0].confdeltype).toBe('n');

      const indexes = rowsOf(
         await db.execute(
            sql`SELECT indexname FROM pg_indexes WHERE tablename IN ('notification', 'issue_pr_link', 'activity_event', 'comment')`
         )
      ).map((row) => row.indexname);
      expect(indexes).toEqual(
         expect.arrayContaining([
            'idx_notification_issue',
            'idx_notification_recipient_created_at',
            'idx_notification_unread_recipient',
            'idx_issue_pr_link_issue',
            'idx_activity_actor_created_at',
            'idx_comment_author_created_at',
         ])
      );
   });
});
