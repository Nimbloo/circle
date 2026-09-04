import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { getMember, listMembers, setMemberDeactivated } from '@/lib/api/members';
import { decideKeycloakLogin } from '@/lib/api/login-gate';
import { createInvite } from '@/lib/api/invites';
import { PATCH as patchMember } from '@/app/api/v1/members/[id]/route';
import { listAudit } from '@/lib/api/audit';

const ADMIN = 'ana@nimbloo.ai';
const LIA = 'lia@nimbloo.ai';

let db: Db;
let adminId: string;
let liaId: string;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedTeam(db, 'WEB');
   adminId = await seedUser(db, { name: 'Ana', email: ADMIN, role: 'Admin', teamIds: ['CORE'] });
   liaId = await seedUser(db, { name: 'Lia', email: LIA, teamIds: ['CORE', 'WEB'] });
   __setTestDb(db);
});
afterEach(() => __setTestDb(null));

function patchReq(id: string, body: unknown, email = ADMIN) {
   return new Request(`http://x/api/v1/members/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-forwarded-email': email },
      body: JSON.stringify(body),
   });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const profile = (over: Record<string, unknown> = {}) => ({
   email: LIA,
   email_verified: true,
   groups: ['app-circle'],
   ...over,
});

describe('desativar membro (#100)', () => {
   it('marca deactivatedAt e remove de TODOS os times, preservando o usuário', async () => {
      const before = await getMember(db, liaId);
      expect(before!.teamIds.sort()).toEqual(['CORE', 'WEB']);

      const dto = await setMemberDeactivated(db, liaId, true);
      expect(dto!.deactivatedAt).toBeTruthy();
      expect(dto!.teamIds).toEqual([]);
      // O usuário continua existindo (histórico intacto).
      expect((await getMember(db, liaId))!.email).toBe(LIA);
   });

   it('é idempotente e reversível', async () => {
      const first = await setMemberDeactivated(db, liaId, true);
      const again = await setMemberDeactivated(db, liaId, true);
      expect(again!.deactivatedAt).toBe(first!.deactivatedAt);

      const back = await setMemberDeactivated(db, liaId, false);
      expect(back!.deactivatedAt).toBeNull();
   });

   it('bloqueia o login mesmo com grupo app-circle e não queima convite', async () => {
      await setMemberDeactivated(db, liaId, true);
      expect(await decideKeycloakLogin(db, profile(), LIA)).toEqual({
         allowed: false,
         reason: 'deactivated',
      });

      // Sem grupo, com convite: continua barrado E o convite fica intacto.
      await createInvite(db, 'novo@nimbloo.ai', ADMIN);
      expect(await decideKeycloakLogin(db, profile({ groups: [], email: LIA }), LIA)).toMatchObject(
         { allowed: false, reason: 'deactivated' }
      );

      // Reativado, volta a entrar.
      await setMemberDeactivated(db, liaId, false);
      expect(await decideKeycloakLogin(db, profile(), LIA)).toEqual({
         allowed: true,
         via: 'group',
      });
   });

   it('listMembers segue devolvendo o desativado (a UI é que filtra)', async () => {
      await setMemberDeactivated(db, liaId, true);
      const all = await listMembers(db);
      const lia = all.find((m) => m.id === liaId)!;
      expect(lia.deactivatedAt).toBeTruthy();
   });

   it('rota PATCH: admin desativa e reativa, gerando audit', async () => {
      const off = await patchMember(patchReq(liaId, { deactivated: true }), params(liaId));
      expect(off.status).toBe(200);
      expect((await off.json()).data.deactivatedAt).toBeTruthy();

      const on = await patchMember(patchReq(liaId, { deactivated: false }), params(liaId));
      expect((await on.json()).data.deactivatedAt).toBeNull();

      const actions = (await listAudit(db)).map((a) => a.action);
      expect(actions).toContain('member.deactivate');
      expect(actions).toContain('member.reactivate');
   });

   it('rota PATCH: não-admin recebe 403 e admin não desativa a si mesmo', async () => {
      const forbidden = await patchMember(
         patchReq(adminId, { deactivated: true }, LIA),
         params(adminId)
      );
      expect(forbidden.status).toBe(403);

      const self = await patchMember(patchReq(adminId, { deactivated: true }), params(adminId));
      expect(self.status).toBe(400);
   });
});
