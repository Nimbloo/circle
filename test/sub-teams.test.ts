import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createTeam, updateTeam, getTeam, deleteTeam } from '@/lib/api/teams';
import { createIssue, listIssues } from '@/lib/api/issues';
import { createProject, listProjects } from '@/lib/api/projects';
import { teamAncestorIds, teamDescendantIds } from '@/lib/api/hierarchy';
import type { Db } from '@/db';

const ANA = 'ana@nimbloo.ai';

async function seedTree(db: Db) {
   await seedTeam(db, 'CORE', 'Core');
   await seedTeam(db, 'WEB', 'Web');
   await seedTeam(db, 'MOBILE', 'Mobile');
   await updateTeam(db, 'WEB', { parentId: 'CORE' });
   await updateTeam(db, 'MOBILE', { parentId: 'WEB' });
}

describe('sub-times (#100)', () => {
   it('grava o pai e o expõe no DTO; `null` desvincula', async () => {
      const db = await makeTestDb();
      await seedTree(db);
      expect((await getTeam(db, 'WEB'))!.parentId).toBe('CORE');
      expect((await getTeam(db, 'CORE'))!.parentId).toBeNull();

      await updateTeam(db, 'WEB', { parentId: null });
      expect((await getTeam(db, 'WEB'))!.parentId).toBeNull();
   });

   it('createTeam aceita parentId e recusa pai inexistente', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const child = await createTeam(db, { id: 'OPS', name: 'Ops', parentId: 'CORE' }, ANA);
      expect(child.parentId).toBe('CORE');
      await expect(createTeam(db, { id: 'X1', name: 'X', parentId: 'NOPE' })).rejects.toMatchObject(
         { status: 400 }
      );
   });

   it('recusa ciclo (pai de si mesmo e pai que é descendente)', async () => {
      const db = await makeTestDb();
      await seedTree(db);
      await expect(updateTeam(db, 'CORE', { parentId: 'CORE' })).rejects.toMatchObject({
         status: 400,
      });
      // CORE › WEB › MOBILE — pôr MOBILE como pai de CORE fecharia o ciclo.
      await expect(updateTeam(db, 'CORE', { parentId: 'MOBILE' })).rejects.toMatchObject({
         status: 400,
      });
      // Movimento legítimo continua passando.
      await expect(updateTeam(db, 'MOBILE', { parentId: 'CORE' })).resolves.toBeTruthy();
   });

   it('descendentes e ancestrais atravessam a árvore inteira', async () => {
      const db = await makeTestDb();
      await seedTree(db);
      expect((await teamDescendantIds(db, ['CORE'])).sort()).toEqual(['CORE', 'MOBILE', 'WEB']);
      expect(await teamDescendantIds(db, ['MOBILE'])).toEqual(['MOBILE']);
      expect(await teamAncestorIds(db, 'MOBILE')).toEqual(['WEB', 'CORE']);
      expect(await teamAncestorIds(db, 'CORE')).toEqual([]);
   });

   it('listIssues do pai inclui as issues dos sub-times', async () => {
      const db = await makeTestDb();
      await seedTree(db);
      await seedUser(db, { name: 'Ana', email: ANA, teamIds: ['CORE'] });
      const base = { statusId: 'to-do', priorityId: 'high' };
      await createIssue(db, { ...base, teamId: 'CORE', title: 'do core' }, ANA);
      await createIssue(db, { ...base, teamId: 'WEB', title: 'do web' }, ANA);
      await createIssue(db, { ...base, teamId: 'MOBILE', title: 'do mobile' }, ANA);

      const fromCore = await listIssues(db, { team: 'CORE' });
      expect(fromCore.map((i) => i.title).sort()).toEqual(['do core', 'do mobile', 'do web']);

      const fromWeb = await listIssues(db, { team: 'WEB' });
      expect(fromWeb.map((i) => i.title).sort()).toEqual(['do mobile', 'do web']);

      const fromMobile = await listIssues(db, { team: 'MOBILE' });
      expect(fromMobile.map((i) => i.title)).toEqual(['do mobile']);
   });

   it('listProjects do pai inclui os projetos dos sub-times', async () => {
      const db = await makeTestDb();
      await seedTree(db);
      const base = {
         statusId: 'proj-in-progress',
         priorityId: 'high',
         healthId: 'on-track',
      };
      await createProject(db, { ...base, name: 'P core', teamId: 'CORE' });
      await createProject(db, { ...base, name: 'P web', teamId: 'WEB' });

      expect((await listProjects(db, { team: 'CORE' })).map((p) => p.name).sort()).toEqual([
         'P core',
         'P web',
      ]);
      expect((await listProjects(db, { team: 'WEB' })).map((p) => p.name)).toEqual(['P web']);
   });

   it('apagar o time reancora os filhos no avô (sem FK órfã)', async () => {
      const db = await makeTestDb();
      await seedTree(db); // CORE › WEB › MOBILE
      expect(await deleteTeam(db, 'WEB')).toBe(true);
      expect((await getTeam(db, 'MOBILE'))!.parentId).toBe('CORE');
   });
});
