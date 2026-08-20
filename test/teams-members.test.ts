import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { listTeams, getTeam, listTeamMembers } from '@/lib/api/teams';
import { listMembers, getMember } from '@/lib/api/members';

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
});
