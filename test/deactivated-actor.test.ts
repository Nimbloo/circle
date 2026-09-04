import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { createIssue } from '@/lib/api/issues';
import { getMember, listMembers, setMemberDeactivated, updateMemberRole } from '@/lib/api/members';
import { getOrCreateUser } from '@/lib/api/users';

import { GET as getMeRoute } from '@/app/api/v1/me/route';
import { GET as listIssuesRoute, POST as createIssueRoute } from '@/app/api/v1/issues/route';
import { PATCH as patchIssueRoute } from '@/app/api/v1/issues/[id]/route';
import { GET as listMembersRoute } from '@/app/api/v1/members/route';
import { POST as createAutomationRoute } from '@/app/api/v1/teams/[teamKey]/automations/route';

/**
 * DESLIGAMENTO QUE DESLIGA (#100).
 *
 * A auditoria da v0.29.0 provou que `deactivated_at` só era lido no `signIn`: com a
 * sessão JWT já emitida (30 dias, sem revogação), o desativado continuava lendo e
 * ESCREVENDO. Pior: desativar AMPLIAVA o alcance — saía dos times mas mantinha o papel
 * `Member`, que é escopo irrestrito. Aqui cada uma dessas portas é fechada.
 */

const ADMIN = 'ana@nimbloo.ai';
const OFF = 'off@nimbloo.ai';

let db: Db;
let offId = '';
let issueId = '';

function req(url: string, email: string, init: RequestInit = {}) {
   return new Request(url, {
      ...init,
      headers: { 'x-forwarded-email': email, 'content-type': 'application/json' },
   });
}
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'OPEN', 'Open');
   await seedTeam(db, 'SECRET', 'Secret');
   await seedUser(db, { name: 'Ana', email: ADMIN, role: 'Admin', teamIds: ['OPEN', 'SECRET'] });
   offId = await seedUser(db, { name: 'Off', email: OFF, role: 'Member', teamIds: ['OPEN'] });
   const created = await createIssue(
      db,
      { teamId: 'OPEN', title: 'Aberta', statusId: 'to-do', priorityId: 'high' },
      ADMIN
   );
   issueId = created.id;
});
afterEach(() => __setTestDb(null));

describe('conta desativada perde o acesso na hora (#100)', () => {
   it('403 na leitura, na listagem e na escrita — a sessão viva não vale mais', async () => {
      // Antes de desativar: tudo 200, é o baseline.
      expect((await getMeRoute(req('http://x/api/v1/me', OFF))).status).toBe(200);
      await setMemberDeactivated(db, offId, true);

      expect((await getMeRoute(req('http://x/api/v1/me', OFF))).status).toBe(403);
      expect((await listIssuesRoute(req('http://x/api/v1/issues', OFF))).status).toBe(403);
      const patch = await patchIssueRoute(
         req('http://x/api/v1/issues/' + issueId, OFF, {
            method: 'PATCH',
            body: JSON.stringify({ title: 'sequestrada' }),
         }),
         params({ id: issueId })
      );
      expect(patch.status).toBe(403);
      const post = await createIssueRoute(
         req('http://x/api/v1/issues', OFF, {
            method: 'POST',
            body: JSON.stringify({ teamId: 'OPEN', title: 'nova', statusId: 'to-do' }),
         })
      );
      expect(post.status).toBe(403);
   });

   it('desativar rebaixa o papel — não pode AMPLIAR o escopo de quem saiu', async () => {
      await setMemberDeactivated(db, offId, true);
      const off = await getMember(db, offId);
      // `Member` sem time = escopo IRRESTRITO; `Guest` sem time = escopo VAZIO.
      expect(off!.role).toBe('Guest');
      expect(off!.teamIds).toEqual([]);
   });

   it('some de GET /members por padrão; só volta se pedirem explicitamente', async () => {
      await setMemberDeactivated(db, offId, true);
      const listed = await (await listMembersRoute(req('http://x/api/v1/members', ADMIN))).json();
      expect(listed.data.some((m: { id: string }) => m.id === offId)).toBe(false);

      const withOff = await (
         await listMembersRoute(req('http://x/api/v1/members?includeDeactivated=true', ADMIN))
      ).json();
      expect(withOff.data.some((m: { id: string }) => m.id === offId)).toBe(true);
   });

   it('desativado não é aceito como assignee de automação (400)', async () => {
      const body = (assigneeId: string) =>
         JSON.stringify({
            name: 'Atribui ao responsável',
            trigger: 'issue.created_in_triage',
            action: 'set_assignee',
            config: { assigneeId },
         });
      // Ativo passa — prova que a regra em si é válida e o 400 abaixo é pela desativação.
      const antes = await createAutomationRoute(
         req('http://x/api/v1/teams/OPEN/automations', ADMIN, {
            method: 'POST',
            body: body(offId),
         }),
         params({ teamKey: 'OPEN' })
      );
      expect(antes.status).toBe(200);

      await setMemberDeactivated(db, offId, true);
      const depois = await createAutomationRoute(
         req('http://x/api/v1/teams/OPEN/automations', ADMIN, {
            method: 'POST',
            body: body(offId),
         }),
         params({ teamKey: 'OPEN' })
      );
      expect(depois.status).toBe(400);
   });

   it('getOrCreateUser recusa o desativado (caminho Bearer e token de máquina)', async () => {
      await setMemberDeactivated(db, offId, true);
      await expect(getOrCreateUser(db, OFF)).rejects.toMatchObject({ status: 403 });
   });
});

describe('workspace nunca fica sem administrador', () => {
   it('o último admin não se rebaixa nem se desativa', async () => {
      const [admin] = await listMembers(db, { role: ['Admin'] });
      await expect(updateMemberRole(db, admin.id, 'Member')).rejects.toMatchObject({ status: 409 });
      await expect(setMemberDeactivated(db, admin.id, true)).rejects.toMatchObject({ status: 409 });
   });

   it('com um segundo admin ativo, o rebaixamento passa', async () => {
      const outroId = await seedUser(db, {
         name: 'Bia',
         email: 'bia@nimbloo.ai',
         role: 'Admin',
         teamIds: ['OPEN'],
      });
      const [first] = await listMembers(db, { role: ['Admin'] });
      const alvo = first.id === outroId ? outroId : first.id;
      expect((await updateMemberRole(db, alvo, 'Member'))!.role).toBe('Member');
   });
});
