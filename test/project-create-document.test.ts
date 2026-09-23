import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { sql } from 'drizzle-orm';
import { __setTestDb, type Db } from '@/db';
import { documentFolder, projectResource, teamDocument } from '@/db/schema';
import { createProject } from '@/lib/api/projects';
import { createFolder, createProjectDocument } from '@/lib/api/documents';
import { POST as createRoute } from '@/app/api/v1/projects/[id]/documents/route';

/**
 * "Create document…" no Resources do projeto: cria um documento no time do projeto e o
 * vincula como resource (link interno) numa transação só — falhou, nada fica pela metade.
 */
const ME = 'dev@nimbloo.ai';
const OUTSIDER = 'guest@nimbloo.ai';
let db: Db;
let projectId: string;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE', 'Core');
   await seedTeam(db, 'OTHER', 'Other');
   await seedUser(db, { name: 'Dev', email: ME, teamIds: ['CORE'] });
   await seedUser(db, { name: 'Guest', email: OUTSIDER, role: 'Guest', teamIds: ['OTHER'] });
   projectId = (
      await createProject(db, {
         name: 'Checkout',
         statusId: 'proj-in-progress',
         priorityId: 'high',
         healthId: 'on-track',
         teamId: 'CORE',
      })
   ).id;
});
afterEach(() => __setTestDb(null));

describe('createProjectDocument', () => {
   it('time sem pasta: cria a pasta "Projects", o documento e o resource interno', async () => {
      const res = await createProjectDocument(db, projectId, ME);

      const folders = await db.select().from(documentFolder);
      expect(folders).toHaveLength(1);
      expect(folders[0]).toMatchObject({ name: 'Projects', teamId: 'CORE' });

      const docs = await db.select().from(teamDocument);
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({ name: 'Checkout — doc', folderId: folders[0].id });

      // Relativo ao workspace (sem `/<orgId>`): o cliente prefixa a org da rota atual.
      const url = `/team/CORE/documents/${docs[0].id}`;
      expect(res.document).toMatchObject({ id: docs[0].id, teamId: 'CORE', url });
      expect(res.resource).toMatchObject({ label: 'Checkout — doc', url });
      const resources = await db.select().from(projectResource);
      expect(resources).toHaveLength(1);
      expect(resources[0]).toMatchObject({ projectId, url, label: 'Checkout — doc' });
   });

   it('reusa a pasta "Projects" existente, mesmo com outras pastas no time', async () => {
      await createFolder(db, { teamId: 'CORE', name: 'Alpha' }, ME);
      const projects = await createFolder(db, { teamId: 'CORE', name: 'projects' }, ME);
      const res = await createProjectDocument(db, projectId, ME);
      expect(res.document.folderId).toBe(projects.id);
      expect(await db.select().from(documentFolder)).toHaveLength(2);
   });

   it('sem pasta "Projects", usa a primeira pasta existente do time', async () => {
      await createFolder(db, { teamId: 'CORE', name: 'Zeta' }, ME);
      const alpha = await createFolder(db, { teamId: 'CORE', name: 'Alpha' }, ME);
      const res = await createProjectDocument(db, projectId, ME);
      expect(res.document.folderId).toBe(alpha.id);
      expect(await db.select().from(documentFolder)).toHaveLength(2);
   });

   it('fora do escopo do projeto: 403 e nada é criado', async () => {
      await expect(createProjectDocument(db, projectId, OUTSIDER)).rejects.toMatchObject({
         status: 403,
      });
      expect(await db.select().from(documentFolder)).toHaveLength(0);
      expect(await db.select().from(teamDocument)).toHaveLength(0);
      expect(await db.select().from(projectResource)).toHaveLength(0);
   });

   it('projeto inexistente: 404', async () => {
      await expect(createProjectDocument(db, 'nope', ME)).rejects.toMatchObject({ status: 404 });
   });

   it('duas criações simultâneas num time sem pasta usam a mesma pasta "Projects"', async () => {
      await Promise.all([
         createProjectDocument(db, projectId, ME),
         createProjectDocument(db, projectId, ME),
      ]);
      const folders = await db.select().from(documentFolder);
      expect(folders.filter((f) => f.name === 'Projects')).toHaveLength(1);
      expect(await db.select().from(teamDocument)).toHaveLength(2);
   });

   it('se o vínculo falha, o documento e a pasta nova não ficam órfãos', async () => {
      // Trigger que derruba o insert do resource: a transação inteira tem que voltar.
      await db.execute(
         sql.raw(`CREATE FUNCTION fail_resource() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'boom'; END; $$ LANGUAGE plpgsql`)
      );
      await db.execute(
         sql.raw(`CREATE TRIGGER fail_resource BEFORE INSERT ON project_resource
            FOR EACH ROW EXECUTE FUNCTION fail_resource()`)
      );
      await expect(createProjectDocument(db, projectId, ME)).rejects.toBeTruthy();
      expect(await db.select().from(documentFolder)).toHaveLength(0);
      expect(await db.select().from(teamDocument)).toHaveLength(0);
      expect(await db.select().from(projectResource)).toHaveLength(0);
   });

   it('nome de projeto no limite: o nome do documento é truncado para caber', async () => {
      const long = (
         await createProject(db, {
            name: 'x'.repeat(196),
            statusId: 'proj-in-progress',
            priorityId: 'high',
            healthId: 'on-track',
            teamId: 'CORE',
         })
      ).id;
      const res = await createProjectDocument(db, long, ME);
      expect(res.document.name.length).toBeLessThanOrEqual(196);
      expect(res.document.name.endsWith(' — doc')).toBe(true);
   });
});

describe('POST /projects/:id/documents', () => {
   it('cria e devolve documento + resource', async () => {
      const res = await createRoute(
         new Request(`http://x/api/v1/projects/${projectId}/documents`, {
            method: 'POST',
            headers: { 'x-forwarded-email': ME, 'content-type': 'application/json' },
         }),
         { params: Promise.resolve({ id: projectId }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const data = body.data ?? body;
      expect(data.document.url).toMatch(/^\/team\/CORE\/documents\//);
      expect(await db.select().from(projectResource)).toHaveLength(1);
   });
});
