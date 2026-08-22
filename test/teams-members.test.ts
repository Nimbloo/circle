import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { issue } from '@/db/schema';
import {
   listTeams,
   getTeam,
   listTeamMembers,
   createTeam,
   addTeamMember,
   removeTeamMember,
   updateTeam,
   deleteTeam,
   requestToJoin,
   listJoinRequests,
   decideJoinRequest,
   pendingRequestTeamIds,
} from '@/lib/api/teams';
import { listMembers, getMember, updateMemberRole } from '@/lib/api/members';
import { createView } from '@/lib/api/views';
import { createFolder } from '@/lib/api/documents';
import { isAdmin, emailFromRequest } from '@/lib/api/auth';
import { getOrCreateUser } from '@/lib/api/users';

async function workspace() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE', 'Core');
   await seedTeam(db, 'DESIGN', 'Design');
   const ana = await seedUser(db, {
      name: 'Ana',
      email: 'ana@nimbloo.ai',
      teamIds: ['CORE', 'DESIGN'],
      joinedAt: '2026-01-05',
   });
   const bob = await seedUser(db, {
      name: 'Bob',
      email: 'bob@nimbloo.ai',
      teamIds: ['CORE'],
      role: 'Admin',
      joinedAt: '2026-01-02',
   });
   return { db, ana, bob };
}

describe('teams', () => {
   it('lists teams with member counts and joined flag for the current user', async () => {
      const { db, ana } = await workspace();
      const teams = await listTeams(db, { sort: 'name' }, ana);
      expect(teams.map((t) => t.id)).toEqual(['CORE', 'DESIGN']);
      const core = teams.find((t) => t.id === 'CORE')!;
      expect(core.memberCount).toBe(2);
      expect(core.joined).toBe(true); // ana está no CORE
   });

   it('filters by membership Not-Joined', async () => {
      const { db, bob } = await workspace();
      // bob só está no CORE -> DESIGN é Not-Joined
      const notJoined = await listTeams(db, { membership: ['Not-Joined'] }, bob);
      expect(notJoined.map((t) => t.id)).toEqual(['DESIGN']);
   });

   it('sorts by member count desc', async () => {
      const { db } = await workspace();
      const teams = await listTeams(db, { sort: 'members', dir: 'desc' });
      expect(teams[0].id).toBe('CORE'); // 2 membros > 1
   });

   it('gets a team and lists its members', async () => {
      const { db } = await workspace();
      expect((await getTeam(db, 'CORE'))?.name).toBe('Core');
      const members = await listTeamMembers(db, 'CORE');
      expect(members).toHaveLength(2);
   });

   it('creates a team (uppercases the key, rejects duplicates and bad keys)', async () => {
      const { db } = await workspace();
      const dto = await createTeam(db, { id: 'ops', name: 'Operations' });
      expect(dto.id).toBe('OPS');
      expect(dto.name).toBe('Operations');
      await expect(createTeam(db, { id: 'CORE', name: 'x' })).rejects.toThrow();
      await expect(createTeam(db, { id: '1bad', name: 'x' })).rejects.toThrow();
   });

   it('adds a member by email (provisioning) and removes it', async () => {
      const { db } = await workspace();
      await addTeamMember(db, 'DESIGN', 'carol@nimbloo.ai');
      let members = await listTeamMembers(db, 'DESIGN');
      expect(members.some((m) => m.email === 'carol@nimbloo.ai')).toBe(true);

      // idempotente
      await addTeamMember(db, 'DESIGN', 'carol@nimbloo.ai');
      members = await listTeamMembers(db, 'DESIGN');
      expect(members.filter((m) => m.email === 'carol@nimbloo.ai')).toHaveLength(1);

      const carol = members.find((m) => m.email === 'carol@nimbloo.ai')!;
      await removeTeamMember(db, 'DESIGN', carol.id);
      members = await listTeamMembers(db, 'DESIGN');
      expect(members.some((m) => m.email === 'carol@nimbloo.ai')).toBe(false);
   });

   it('rejects adding a member to a non-existent team', async () => {
      const { db } = await workspace();
      await expect(addTeamMember(db, 'NOPE', 'x@nimbloo.ai')).rejects.toThrow();
   });

   it('updates a team (rename)', async () => {
      const { db } = await workspace();
      const dto = await updateTeam(db, 'CORE', { name: 'Core Team' });
      expect(dto?.name).toBe('Core Team');
      expect((await getTeam(db, 'CORE'))?.name).toBe('Core Team');
      expect(await updateTeam(db, 'NOPE', { name: 'x' })).toBeNull();
   });

   it('deletes an empty team but refuses when it has issues (409)', async () => {
      const { db, ana } = await workspace();
      // DESIGN está vazio -> apaga (remove os team_member primeiro)
      expect(await deleteTeam(db, 'DESIGN')).toBe(true);
      expect(await getTeam(db, 'DESIGN')).toBeNull();

      // CORE ganha uma issue -> recusa
      await db.insert(issue).values({
         id: 'iss-1',
         identifier: 'CORE-1',
         teamId: 'CORE',
         title: 'algo',
         statusId: 'to-do',
         priorityId: 'medium',
         assigneeId: ana,
         createdById: ana,
         projectId: null,
         cycleId: null,
         rank: 'a0',
         dueDate: null,
      });
      await expect(deleteTeam(db, 'CORE')).rejects.toThrow();
      expect(await getTeam(db, 'CORE')).not.toBeNull(); // segue existindo
   });

   it('refuses to delete a team that still has a saved view (FK RESTRICT)', async () => {
      const { db, ana } = await workspace();
      await createView(
         db,
         { slug: 'v', name: 'V', type: 'issue', filter: {}, teamId: 'DESIGN' },
         'ana@nimbloo.ai'
      );
      // DESIGN não está mais "vazio" -> recusa 409 em vez de estourar 500 no FK
      await expect(deleteTeam(db, 'DESIGN')).rejects.toThrow();
      expect(await getTeam(db, 'DESIGN')).not.toBeNull();
      void ana;
   });

   it('refuses to delete a team that still has a document folder (FK RESTRICT)', async () => {
      const { db } = await workspace();
      // ana é membro de DESIGN — passa na checagem de membership do createFolder.
      await createFolder(db, { teamId: 'DESIGN', name: 'Specs' }, 'ana@nimbloo.ai');
      await expect(deleteTeam(db, 'DESIGN')).rejects.toThrow();
      expect(await getTeam(db, 'DESIGN')).not.toBeNull();
   });
});

describe('members', () => {
   it('lists members with team counts and filters by role', async () => {
      const { db } = await workspace();
      const all = await listMembers(db, { sort: 'name' });
      expect(all).toHaveLength(2);
      const ana = all.find((m) => m.email === 'ana@nimbloo.ai')!;
      expect(ana.teamCount).toBe(2);

      const admins = await listMembers(db, { role: ['Admin'] });
      expect(admins).toHaveLength(1);
      expect(admins[0].name).toBe('Bob');
   });

   it('sorts by joined date', async () => {
      const { db } = await workspace();
      const byJoined = await listMembers(db, { sort: 'joined' });
      expect(byJoined[0].email).toBe('bob@nimbloo.ai'); // 2026-01-02 < 2026-01-05
   });

   it('gets a member by id', async () => {
      const { db, ana } = await workspace();
      expect((await getMember(db, ana))?.name).toBe('Ana');
      expect(await getMember(db, 'nope')).toBeNull();
   });

   it('updates a member role (validates the enum)', async () => {
      const { db, ana } = await workspace();
      const dto = await updateMemberRole(db, ana, 'Admin');
      expect(dto?.role).toBe('Admin');
      expect((await getMember(db, ana))?.role).toBe('Admin');

      await expect(updateMemberRole(db, ana, 'Superuser')).rejects.toThrow();
      expect(await updateMemberRole(db, 'nope', 'Member')).toBeNull();
   });
});

// A escalada de privilégio é barrada no route handler (members/[id] PATCH):
// `if (!isAdmin(email, db)) throw new ApiError(403, ...)`. Como o vitest deste
// sandbox não resolve `next/server` (usado pelo route), validamos aqui a
// função-porteiro `isAdmin` — a decisão de allow/deny que o gate consome.
describe('member role escalation gate (isAdmin)', () => {
   const prevAdmins = process.env.CIRCLE_ADMIN_EMAILS;
   afterEach(() => {
      if (prevAdmins === undefined) delete process.env.CIRCLE_ADMIN_EMAILS;
      else process.env.CIRCLE_ADMIN_EMAILS = prevAdmins;
   });

   it('denies a non-admin (would 403) and allows only allowlisted admins', async () => {
      process.env.CIRCLE_ADMIN_EMAILS = 'boss@nimbloo.ai';
      const { db } = await workspace();
      // não-admin -> gate lança 403 (PATCH role bloqueado)
      expect(await isAdmin('ana@nimbloo.ai', db)).toBe(false);
      // admin da allowlist -> passa (case-insensitive)
      expect(await isAdmin('boss@nimbloo.ai', db)).toBe(true);
      expect(await isAdmin('BOSS@nimbloo.ai', db)).toBe(true);
   });

   it('treats everyone as non-admin when the allowlist is empty and no Admin row exists', async () => {
      delete process.env.CIRCLE_ADMIN_EMAILS;
      const db = await makeTestDb();
      await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      expect(await isAdmin('ana@nimbloo.ai', db)).toBe(false);
   });

   it('honors the DB role column: role=Admin -> isAdmin true even without env', async () => {
      delete process.env.CIRCLE_ADMIN_EMAILS;
      const { db } = await workspace();
      // Bob foi semeado com role='Admin' no banco
      expect(await isAdmin('bob@nimbloo.ai', db)).toBe(true);
      expect(await isAdmin('ana@nimbloo.ai', db)).toBe(false);
   });
});

// Seam de teste: em NODE_ENV=test o e-mail vem do header x-forwarded-email
// (a sessão NextAuth substitui isso em produção).
describe('emailFromRequest (test seam via x-forwarded-email header)', () => {
   const reqWith = (headers: Record<string, string>) =>
      new Request('http://circle.local/api/x', { headers });

   it('reads and normalizes the x-forwarded-email header', async () => {
      const email = await emailFromRequest(reqWith({ 'x-forwarded-email': 'Ana@Nimbloo.ai' }));
      expect(email).toBe('ana@nimbloo.ai');
   });

   it('returns null when the header is absent', async () => {
      const email = await emailFromRequest(reqWith({}));
      expect(email).toBeNull();
   });

   it('returns null when no request is passed', async () => {
      const email = await emailFromRequest();
      expect(email).toBeNull();
   });
});

// Provisionamento por Google/convite: sem bootstrap de 1º admin. Role default = Member,
// exceto e-mail na allowlist CIRCLE_ADMIN_EMAILS.
describe('getOrCreateUser provisioning', () => {
   const prevAdmins = process.env.CIRCLE_ADMIN_EMAILS;
   afterEach(() => {
      if (prevAdmins === undefined) delete process.env.CIRCLE_ADMIN_EMAILS;
      else process.env.CIRCLE_ADMIN_EMAILS = prevAdmins;
   });

   it('provisions new users as Member (no first-admin bootstrap)', async () => {
      delete process.env.CIRCLE_ADMIN_EMAILS;
      const db = await makeTestDb();
      const first = await getOrCreateUser(db, 'first@nimbloo.ai');
      expect(first.role).toBe('Member');
      const second = await getOrCreateUser(db, 'second@nimbloo.ai');
      expect(second.role).toBe('Member');
   });

   it('provisions as Admin when the email is in the allowlist', async () => {
      process.env.CIRCLE_ADMIN_EMAILS = 'boss@nimbloo.ai';
      const db = await makeTestDb();
      const boss = await getOrCreateUser(db, 'boss@nimbloo.ai');
      expect(boss.role).toBe('Admin');
   });
});

describe('team membership: creator + request-to-join', () => {
   afterEach(() => {
      delete process.env.CIRCLE_MAIL_FROM;
      delete process.env.CIRCLE_ADMIN_EMAILS;
   });

   it('createTeam adds the CREATOR as the first member (no more orphan teams)', async () => {
      const db = await makeTestDb();
      const dto = await createTeam(db, { id: 'PLAT', name: 'Platform' }, 'founder@nimbloo.ai');
      expect(dto.joined).toBe(true);
      expect(dto.memberCount).toBe(1);
      const members = await listTeamMembers(db, 'PLAT');
      expect(members.map((m) => m.email)).toEqual(['founder@nimbloo.ai']);
   });

   it('requestToJoin creates a pending request; admin approve adds the member', async () => {
      const db = await makeTestDb();
      await createTeam(db, { id: 'PLAT', name: 'Platform' }, 'founder@nimbloo.ai');
      const admin = await getOrCreateUser(db, 'founder@nimbloo.ai'); // creator, will decide

      const res = await requestToJoin(db, 'PLAT', 'newbie@nimbloo.ai');
      expect(res.status).toBe('pending');

      // aparece na fila de pendentes + no set de "solicitado" do usuário
      const pending = await listJoinRequests(db, 'PLAT');
      expect(pending).toHaveLength(1);
      expect(pending[0].user.email).toBe('newbie@nimbloo.ai');
      const newbie = await getOrCreateUser(db, 'newbie@nimbloo.ai');
      expect(await pendingRequestTeamIds(db, newbie.id)).toContain('PLAT');

      // admin aprova → vira membro, fila esvazia, "solicitado" some
      await decideJoinRequest(db, 'PLAT', pending[0].id, 'approved', admin.id);
      const members = await listTeamMembers(db, 'PLAT');
      expect(members.map((m) => m.email).sort()).toEqual([
         'founder@nimbloo.ai',
         'newbie@nimbloo.ai',
      ]);
      expect(await listJoinRequests(db, 'PLAT')).toHaveLength(0);
      expect(await pendingRequestTeamIds(db, newbie.id)).not.toContain('PLAT');
   });

   it('deny keeps the user out; re-request reopens the same row (idempotent)', async () => {
      const db = await makeTestDb();
      await createTeam(db, { id: 'PLAT', name: 'Platform' }, 'founder@nimbloo.ai');
      const admin = await getOrCreateUser(db, 'founder@nimbloo.ai');

      await requestToJoin(db, 'PLAT', 'newbie@nimbloo.ai');
      const [req1] = await listJoinRequests(db, 'PLAT');
      await decideJoinRequest(db, 'PLAT', req1.id, 'denied', admin.id);
      expect(await listJoinRequests(db, 'PLAT')).toHaveLength(0);
      expect(await listTeamMembers(db, 'PLAT')).toHaveLength(1); // só o criador

      // re-solicita → mesma linha volta pra pending (sem duplicar)
      await requestToJoin(db, 'PLAT', 'newbie@nimbloo.ai');
      const pending = await listJoinRequests(db, 'PLAT');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(req1.id);
   });

   it('requestToJoin rejects a user who is already a member (409)', async () => {
      const db = await makeTestDb();
      await createTeam(db, { id: 'PLAT', name: 'Platform' }, 'founder@nimbloo.ai');
      await expect(requestToJoin(db, 'PLAT', 'founder@nimbloo.ai')).rejects.toMatchObject({
         status: 409,
      });
   });

   it('leave (removeTeamMember for self) removes the membership', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE', 'Core');
      const uid = await seedUser(db, { name: 'Zoe', email: 'zoe@nimbloo.ai', teamIds: ['CORE'] });
      await removeTeamMember(db, 'CORE', uid);
      expect(await listTeamMembers(db, 'CORE')).toHaveLength(0);
   });

   it('deleteTeam limpa join_requests (não estoura FK 23503)', async () => {
      const db = await makeTestDb();
      // Time vazio (sem issues/projects) MAS com uma solicitação de entrada histórica.
      await createTeam(db, { id: 'TMP', name: 'Temp' });
      await requestToJoin(db, 'TMP', 'x@nimbloo.ai');
      expect(await listJoinRequests(db, 'TMP')).toHaveLength(1);
      // Antes do fix, o FK team_join_request.team_id (sem onDelete) estourava aqui.
      expect(await deleteTeam(db, 'TMP')).toBe(true);
      expect(await getTeam(db, 'TMP')).toBeNull();
   });
});
