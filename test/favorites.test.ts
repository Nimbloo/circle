import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import { createProject } from '@/lib/api/projects';
import { createView } from '@/lib/api/views';
import { deleteProject } from '@/lib/api/projects';
import { listFavorites, addFavorite, removeFavorite } from '@/lib/api/favorites';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
   const user = 'ana@nimbloo.ai';
   const base = { priorityId: 'high', healthId: 'on-track', teamId: 'CORE' as const };
   const project = await createProject(db, { name: 'P1', statusId: 'proj-in-progress', ...base });
   const issue = await createIssue(
      db,
      { teamId: 'CORE', statusId: 'to-do', priorityId: 'high', title: 'Bug X' },
      user
   );
   const view = await createView(
      db,
      { slug: 'my-view', name: 'My View', type: 'issue', filter: {}, icon: '🔭' },
      user
   );
   return { db, user, project, issue, view };
}

describe('favorites', () => {
   it('adds and lists favorites of multiple entity types with resolved names', async () => {
      const { db, user, project, issue, view } = await setup();
      await addFavorite(db, user, 'project', project.id);
      await addFavorite(db, user, 'issue', issue.id);
      await addFavorite(db, user, 'view', view.id);

      const list = await listFavorites(db, user);
      expect(list).toHaveLength(3);
      const byType = Object.fromEntries(list.map((f) => [f.entityType, f]));
      expect(byType.project.name).toBe('P1');
      expect(byType.issue.name).toBe('Bug X');
      expect(byType.issue.identifier).toBe(issue.identifier);
      expect(byType.view.name).toBe('My View');
      expect(byType.view.iconKey).toBe('🔭');
   });

   it('is idempotent (no duplicate on re-add)', async () => {
      const { db, user, project } = await setup();
      const first = await addFavorite(db, user, 'project', project.id);
      const second = await addFavorite(db, user, 'project', project.id);
      expect(first.added).toBe(true);
      expect(second.added).toBe(false);
      expect(await listFavorites(db, user)).toHaveLength(1);
   });

   it('removes a favorite', async () => {
      const { db, user, project } = await setup();
      await addFavorite(db, user, 'project', project.id);
      const res = await removeFavorite(db, user, 'project', project.id);
      expect(res.removed).toBe(true);
      expect(await listFavorites(db, user)).toHaveLength(0);
   });

   it('rejects an invalid entity type', async () => {
      const { db, user } = await setup();
      await expect(addFavorite(db, user, 'cycle', 'x')).rejects.toThrow();
   });

   it('silently omits favorites whose entity was deleted', async () => {
      const { db, user, project } = await setup();
      await addFavorite(db, user, 'project', project.id);
      await deleteProject(db, project.id);
      expect(await listFavorites(db, user)).toHaveLength(0);
   });

   it('scopes favorites per user', async () => {
      const { db, user, project } = await setup();
      await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai', teamIds: ['CORE'] });
      await addFavorite(db, user, 'project', project.id);
      expect(await listFavorites(db, 'bob@nimbloo.ai')).toHaveLength(0);
   });
});
