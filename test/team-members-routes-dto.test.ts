import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import type { MemberDto } from '@/lib/api/members';
import {
   GET as listTeamMembersRoute,
   POST as addTeamMemberRoute,
} from '@/app/api/v1/teams/[teamKey]/members/route';
import { DELETE as removeTeamMemberRoute } from '@/app/api/v1/teams/[teamKey]/members/[userId]/route';
import { DELETE as leaveTeamRoute } from '@/app/api/v1/teams/[teamKey]/members/self/route';
import { POST as requestJoinRoute } from '@/app/api/v1/teams/[teamKey]/join-requests/route';
import { GET as listJoinRoute } from '@/app/api/v1/teams/[teamKey]/join-requests/route';
import { POST as decideJoinRoute } from '@/app/api/v1/teams/[teamKey]/join-requests/[id]/route';

/**
 * #7 — as rotas de membros de time devolviam 6 campos tipados como `MemberDto[]`; o
 * `applyTeamMembers` do cliente zerava `teamIds` de quem aparecia na lista. O teste
 * confere o PAYLOAD de cada rota: DTO completo, com TODOS os times do membro.
 */

const ADMIN = 'ana@nimbloo.ai';
const BOB = 'bob@nimbloo.ai';
const CARL = 'carl@nimbloo.ai';
let db: Db;
let bobId = '';
let carlId = '';

function req(url: string, email: string, init: RequestInit = {}) {
   return new Request(url, {
      ...init,
      headers: { 'x-forwarded-email': email, 'content-type': 'application/json' },
   });
}
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

const FULL_KEYS: (keyof MemberDto)[] = [
   'id',
   'slug',
   'name',
   'email',
   'avatarUrl',
   'role',
   'presence',
   'timezone',
   'joinedAt',
   'teamCount',
   'teamIds',
   'deactivatedAt',
];

function expectFull(list: MemberDto[], id: string, teamIds: string[]) {
   const m = list.find((x) => x.id === id);
   expect(m).toBeDefined();
   for (const k of FULL_KEYS) expect(m).toHaveProperty(k);
   expect([...m!.teamIds].sort()).toEqual([...teamIds].sort());
   expect(m!.teamCount).toBe(teamIds.length);
}

async function data(res: Response) {
   expect(res.status).toBe(200);
   return (await res.json()).data;
}

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE');
   await seedTeam(db, 'OPS', 'Ops');
   await seedUser(db, { name: 'Ana', email: ADMIN, role: 'Admin', teamIds: ['CORE'] });
   bobId = await seedUser(db, { name: 'Bob', email: BOB, teamIds: ['CORE', 'OPS'] });
   carlId = await seedUser(db, { name: 'Carl', email: CARL, teamIds: ['OPS'] });
});
afterEach(() => __setTestDb(null));

describe('rotas de membros de time devolvem MemberDto completo (#7)', () => {
   it('GET, POST, DELETE e self', async () => {
      const url = 'http://x/api/v1/teams/CORE/members';
      expectFull(
         await data(await listTeamMembersRoute(req(url, ADMIN), params({ teamKey: 'CORE' }))),
         bobId,
         ['CORE', 'OPS']
      );

      const added = await data(
         await addTeamMemberRoute(
            req(url, ADMIN, { method: 'POST', body: JSON.stringify({ email: CARL }) }),
            params({ teamKey: 'CORE' })
         )
      );
      expectFull(added, carlId, ['CORE', 'OPS']);
      expectFull(added, bobId, ['CORE', 'OPS']);

      const removed = await data(
         await removeTeamMemberRoute(
            req(url + '/' + carlId, ADMIN, { method: 'DELETE' }),
            params({ teamKey: 'CORE', userId: carlId })
         )
      );
      expect(removed.find((m: MemberDto) => m.id === carlId)).toBeUndefined();
      expectFull(removed, bobId, ['CORE', 'OPS']);

      const left = await data(
         await leaveTeamRoute(
            req(url + '/self', BOB, { method: 'DELETE' }),
            params({ teamKey: 'CORE' })
         )
      );
      expect(left.find((m: MemberDto) => m.id === bobId)).toBeUndefined();
      for (const m of left as MemberDto[]) for (const k of FULL_KEYS) expect(m).toHaveProperty(k);
   });

   it('aprovar solicitação devolve membros completos', async () => {
      const jr = 'http://x/api/v1/teams/CORE/join-requests';
      await data(
         await requestJoinRoute(req(jr, CARL, { method: 'POST' }), params({ teamKey: 'CORE' }))
      );
      const pending = await data(await listJoinRoute(req(jr, ADMIN), params({ teamKey: 'CORE' })));
      const decided = await data(
         await decideJoinRoute(
            req(jr + '/' + pending[0].id, ADMIN, {
               method: 'POST',
               body: JSON.stringify({ decision: 'approved' }),
            }),
            params({ teamKey: 'CORE', id: pending[0].id })
         )
      );
      expectFull(decided.members, carlId, ['CORE', 'OPS']);
   });
});
