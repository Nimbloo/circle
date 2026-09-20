import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedWorkspaceFixture, type WorkspaceFixture } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import {
   issue as issueT,
   team as teamT,
   label as labelT,
   issueLabel,
   issueRelation,
} from '@/db/schema';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { createIssue, deleteIssue } from '@/lib/api/issues';
import { firstRank } from '@/lib/api/rank';

let db: Db;
let fx: WorkspaceFixture;
let eventos: CircleEvent[];
let parar: () => void;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   fx = await seedWorkspaceFixture(db);
   await db.update(issueT).set({ rank: firstRank() }).where(eq(issueT.id, fx.issueId));
   await db.update(teamT).set({ issueSeq: 1 }).where(eq(teamT.id, fx.teamId));
   await db
      .insert(labelT)
      .values([
         { id: 'L-bug', name: 'Bug', color: 'red', groupId: 'kind' },
         { id: 'L-feat', name: 'Feature', color: 'blue', groupId: 'kind' },
         { id: 'L-ui', name: 'UI', color: 'green', groupId: null },
      ])
      .onConflictDoNothing();
   eventos = [];
   parar = subscribe((e) => eventos.push(e));
});
afterEach(() => parar());

const base = () => ({
   teamId: fx.teamId,
   title: 'Nova',
   statusId: 'to-do',
   priorityId: 'no-priority',
});

describe('Is#20 labels no create', () => {
   it('label inexistente vira 400 (não 500 de FK)', async () => {
      await expect(
         createIssue(db, { ...base(), labelIds: ['L-nao-existe'] }, fx.ownerEmail)
      ).rejects.toMatchObject({ status: 400 });
   });

   it('duas labels do mesmo grupo exclusivo são recusadas', async () => {
      await expect(
         createIssue(db, { ...base(), labelIds: ['L-bug', 'L-feat'] }, fx.ownerEmail)
      ).rejects.toMatchObject({ status: 400 });
   });

   it('labels válidas (e repetidas) gravam uma vez cada', async () => {
      const dto = await createIssue(
         db,
         { ...base(), labelIds: ['L-bug', 'L-ui', 'L-ui'] },
         fx.ownerEmail
      );
      const rows = await db.select().from(issueLabel).where(eq(issueLabel.issueId, dto.id));
      expect(rows.map((r) => r.labelId).sort()).toEqual(['L-bug', 'L-ui']);
   });
});

describe('Is#21 delete avisa as relacionadas', () => {
   it('publica updated para as issues relacionadas nas duas direções', async () => {
      const a = await createIssue(db, { ...base(), title: 'A' }, fx.ownerEmail);
      const b = await createIssue(db, { ...base(), title: 'B' }, fx.ownerEmail);
      await db.insert(issueRelation).values([
         { id: 'R-1', issueId: fx.issueId, relatedId: a.id, kind: 'related' },
         { id: 'R-2', issueId: b.id, relatedId: fx.issueId, kind: 'blocked_by' },
      ]);
      eventos = [];
      await deleteIssue(db, fx.issueId, fx.ownerEmail);
      const updated = eventos
         .filter((e) => e.entity === 'issue' && e.action === 'updated')
         .map((e) => e.id);
      expect(updated).toEqual(expect.arrayContaining([a.id, b.id]));
   });
});
