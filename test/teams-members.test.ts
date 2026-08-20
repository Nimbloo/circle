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
} from '@/lib/api/teams';
import { listMembers, getMember, updateMemberRole } from '@/lib/api/members';
import { createView } from '@/lib/api/views';
import { createFolder } from '@/lib/api/documents';
import { isAdmin } from '@/lib/api/auth';

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
      await createFolder(db, { teamId: 'DESIGN', name: 'Specs' });
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
// `if (!isAdmin(email)) throw new ApiError(403, ...)`. Como o vitest deste
// sandbox não resolve `next/server` (usado pelo route), validamos aqui a
// função-porteiro `isAdmin` — a decisão de allow/deny que o gate consome.
describe('member role escalation gate (isAdmin)', () => {
   const prevAdmins = process.env.CIRCLE_ADMIN_EMAILS;
   afterEach(() => {
      if (prevAdmins === undefined) delete process.env.CIRCLE_ADMIN_EMAILS;
      else process.env.CIRCLE_ADMIN_EMAILS = prevAdmins;
   });

   it('denies a non-admin (would 403) and allows only allowlisted admins', () => {
      process.env.CIRCLE_ADMIN_EMAILS = 'boss@nimbloo.ai';
      // não-admin -> gate lança 403 (PATCH role bloqueado)
      expect(isAdmin('bob@nimbloo.ai')).toBe(false);
      // admin da allowlist -> passa (case-insensitive)
      expect(isAdmin('boss@nimbloo.ai')).toBe(true);
      expect(isAdmin('BOSS@nimbloo.ai')).toBe(true);
   });

   it('treats everyone as non-admin when the allowlist is empty', () => {
      delete process.env.CIRCLE_ADMIN_EMAILS;
      expect(isAdmin('bob@nimbloo.ai')).toBe(false);
   });
});
