import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { appUser, issue, project } from '@/db/schema';
import {
   addLabel,
   createIssue,
   deleteIssue,
   listIssueChanges,
   updateIssue,
} from '@/lib/api/issues';
import { GET as listIssuesRoute } from '@/app/api/v1/issues/route';

const DEV = 'dev@nimbloo.ai';
const OLD = new Date('2026-01-01T00:00:00Z');
const SINCE = '2026-06-01T00:00:00.000Z';

let db: Db;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedTeam(db, 'OPS');
   __setTestDb(db);
});
afterEach(() => __setTestDb(null));

async function make(title: string, teamId = 'CORE', extra: Record<string, unknown> = {}) {
   const dto = await createIssue(
      db,
      { teamId, title, statusId: 'to-do', priorityId: 'high', ...extra },
      DEV
   );
   return dto.id;
}

/** Envelhece tudo: só o que mudar depois do `SINCE` volta no incremental. */
async function ageAll() {
   await db.update(issue).set({ updatedAt: OLD });
   await db.update(project).set({ updatedAt: OLD });
   await db.update(appUser).set({ updatedAt: OLD });
}

function get(url: string, email = DEV) {
   return new Request(url, { headers: { 'x-forwarded-email': email } });
}

describe('resync incremental de issues (#14)', () => {
   it('devolve só o que mudou desde `since` e os ids vivos (lápides por ausência)', async () => {
      const a = await make('A');
      const b = await make('B');
      const c = await make('C');
      await ageAll();
      await updateIssue(db, b, { title: 'B2' }, DEV);
      await deleteIssue(db, c, DEV);

      const res = await listIssueChanges(db, new Date(SINCE));
      expect(res.issues.map((i) => i.id)).toEqual([b]);
      expect(res.issues[0].title).toBe('B2');
      expect([...res.ids].sort()).toEqual([a, b].sort());
      expect(res.truncated).toBe(false);
   });

   it('label adicionada conta como mudança da issue', async () => {
      const a = await make('A');
      await ageAll();
      await addLabel(db, a, 'bug', DEV);
      const res = await listIssueChanges(db, new Date(SINCE));
      expect(res.issues.map((i) => i.id)).toEqual([a]);
      expect(res.issues[0].labels.map((l) => l.id)).toContain('bug');
   });

   it('filha alterada traz o pai (rollup de sub-issues)', async () => {
      const parent = await make('Pai');
      const child = await make('Filha', 'CORE', { parentId: parent });
      await ageAll();
      await updateIssue(db, child, { statusId: 'done' }, DEV);
      const res = await listIssueChanges(db, new Date(SINCE));
      expect(res.issues.map((i) => i.id).sort()).toEqual([parent, child].sort());
      expect(res.issues.find((i) => i.id === parent)?.subIssueDoneCount).toBe(1);
   });

   it('usuário renomeado traz as issues em que aparece', async () => {
      const a = await make('A');
      await ageAll();
      await db.update(appUser).set({ name: 'Dev 2', updatedAt: new Date() });
      const res = await listIssueChanges(db, new Date(SINCE));
      expect(res.issues.map((i) => i.id)).toEqual([a]);
      expect(res.issues[0].createdBy?.name).toBe('Dev 2');
   });

   it('acima do limite sinaliza truncated (cliente cai na hidratação completa)', async () => {
      await make('A');
      await make('B');
      const res = await listIssueChanges(db, new Date(SINCE), { limit: 1 });
      expect(res.truncated).toBe(true);
   });

   it('rota: GET /issues?updatedSince= devolve {data, meta:{ids, truncated}}; data inválida = 400', async () => {
      const a = await make('A');
      await ageAll();
      await updateIssue(db, a, { title: 'A2' }, DEV);
      const res = await listIssuesRoute(get(`http://x/api/v1/issues?updatedSince=${SINCE}`));
      const json = await res.json();
      expect(json.data.map((i: { id: string }) => i.id)).toEqual([a]);
      expect(json.meta).toEqual({ ids: [a], truncated: false });

      const bad = await listIssuesRoute(get('http://x/api/v1/issues?updatedSince=ontem'));
      expect(bad.status).toBe(400);
   });

   it('rota respeita o escopo do convidado (mudanças e ids só dos times dele)', async () => {
      await seedUser(db, { name: 'G', email: 'g@nimbloo.ai', role: 'Guest', teamIds: ['OPS'] });
      const mine = await make('Ops', 'OPS');
      await make('Core', 'CORE');
      const res = await listIssuesRoute(
         get(`http://x/api/v1/issues?updatedSince=${SINCE}`, 'g@nimbloo.ai')
      );
      const json = await res.json();
      expect(json.data.map((i: { id: string }) => i.id)).toEqual([mine]);
      expect(json.meta.ids).toEqual([mine]);
   });

   it('sem updatedSince a rota segue devolvendo a lista simples', async () => {
      await make('A');
      const json = await (await listIssuesRoute(get('http://x/api/v1/issues'))).json();
      expect(json.meta).toBeUndefined();
      expect(json.data).toHaveLength(1);
   });
});
