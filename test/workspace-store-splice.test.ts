import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/data/users';
import type { Team } from '@/data/teams';
import type { Project } from '@/data/projects';
import type { Cycle } from '@/data/cycles';
import type { Initiative } from '@/data/initiatives';
import type { View } from '@/data/views';
import type { MeDto } from '@/lib/api/users';
import type { MemberDto } from '@/lib/api/members';
import type { TeamDto } from '@/lib/api/teams';
import type { CycleDto } from '@/lib/api/cycles';
import type { ViewDto } from '@/lib/api/views';
import type { ProjectDto } from '@/lib/api/projects';
import type { InitiativeDto } from '@/lib/api/initiatives';

vi.mock('@/lib/client', () => ({ api: {} }));

const { useWorkspaceStore } = await import('@/store/workspace-store');

/* ------------------------------- Fixtures ------------------------------- */

function user(id: string, teamIds: string[] = []): User {
   return {
      id,
      name: `User ${id}`,
      email: `${id}@circle.test`,
      slug: id,
      avatarUrl: '',
      status: 'online',
      role: 'Member',
      joinedDate: '2026-01-01',
      teamIds,
      timezone: 'America/Sao_Paulo',
   };
}

function member(id: string, teamIds: string[] = [], extra: Partial<MemberDto> = {}): MemberDto {
   return {
      id,
      slug: id,
      name: `Member ${id}`,
      email: `${id}@circle.test`,
      avatarUrl: null,
      role: 'Member',
      presence: 'offline',
      timezone: null,
      joinedAt: '2026-01-01',
      teamCount: teamIds.length,
      teamIds,
      ...extra,
   };
}

const catalogStatus = {
   id: 'in-progress',
   name: 'In Progress',
   color: '#fff',
   category: 'started',
};
const catalogPriority = { id: 'high', name: 'High' };
const catalogHealth = { id: 'on-track', name: 'On track', color: '#0f0', description: null };

function project(id: string, teamId: string, initiative?: string): Project {
   return {
      id,
      name: `Project ${id}`,
      status: { ...catalogStatus, category: 'started', icon: () => null },
      icon: () => null,
      percentComplete: 0,
      startDate: '',
      lead: null,
      priority: { ...catalogPriority, icon: () => null },
      health: { ...catalogHealth, id: 'on-track', description: '' },
      teamId,
      labels: [],
      initiative,
      issueCount: 0,
   } as unknown as Project;
}

function projectDto(id: string, teamId: string, initiativeId: string | null = null): ProjectDto {
   return {
      id,
      name: `Project ${id}`,
      status: catalogStatus,
      percentComplete: 0,
      startDate: null,
      targetDate: null,
      lead: null,
      priority: catalogPriority,
      health: catalogHealth,
      teamId,
      labels: [],
      initiativeId,
      healthUpdatedAgoDays: null,
      issueCount: 0,
   } as unknown as ProjectDto;
}

function team(id: string, members: User[], projects: Project[] = []): Team {
   return {
      id,
      name: `Team ${id}`,
      icon: '📁',
      joined: false,
      color: '#000',
      estimateScale: 'fibonacci',
      cycleCooldownDays: 0,
      members,
      projects,
   };
}

function teamDto(id: string, extra: Partial<TeamDto> = {}): TeamDto {
   return {
      id,
      name: `Team ${id}`,
      icon: null,
      color: null,
      estimateScale: 'fibonacci',
      cycleCooldownDays: 0,
      memberCount: 1,
      projectCount: 0,
      joined: true,
      requested: false,
      ...extra,
   };
}

function cycleDto(id: string, teamId: string, extra: Partial<CycleDto> = {}): CycleDto {
   return {
      id,
      number: 1,
      name: `Cycle ${id}`,
      teamId,
      status: 'upcoming',
      startDate: '2026-09-01',
      endDate: '2026-09-14',
      capacity: 0,
      scope: 0,
      scopeDelta: 0,
      started: 0,
      completed: 0,
      successRate: null,
      burnup: null,
      ...extra,
   } as unknown as CycleDto;
}

function viewDto(id: string, ownerId: string, extra: Partial<ViewDto> = {}): ViewDto {
   return {
      id,
      name: `View ${id}`,
      description: null,
      icon: null,
      type: 'issue',
      teamId: null,
      ownerId,
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
      filter: {},
      ...extra,
   } as unknown as ViewDto;
}

function initiativeDto(id: string, ownerId: string | null, projectIds: string[]): InitiativeDto {
   return {
      id,
      name: `Initiative ${id}`,
      description: null,
      icon: null,
      iconColor: null,
      status: 'active',
      priority: catalogPriority,
      owner: ownerId ? { id: ownerId, name: '', email: '', avatarUrl: null } : null,
      target: null,
      health: catalogHealth,
      labels: [],
      projectIds,
      createdAt: '2026-09-01',
   } as unknown as InitiativeDto;
}

const me: MeDto = {
   id: 'me',
   slug: 'me',
   name: 'User me',
   email: 'me@circle.test',
   avatarUrl: null,
   role: 'Admin',
   admin: true,
   teamIds: ['ENG'],
   subscribedIssueIds: [],
   githubLogin: null,
};

function seed() {
   const uMe = user('me', ['ENG']);
   const uAna = user('ana', ['ENG']);
   const uBob = user('bob', []);
   const p1 = project('p1', 'ENG', 'i1');
   const p2 = project('p2', 'ENG');
   const eng: Team = { ...team('ENG', [uMe, uAna], [p1, p2]), joined: true };
   const ops = team('OPS', []);
   const initiative = {
      id: 'i1',
      name: 'I1',
      owner: uAna,
      projectIds: ['p1'],
   } as unknown as Initiative;
   const view = { id: 'v1', name: 'V1', owner: uAna, filter: {} } as unknown as View;
   const cycle = { id: 'c1', teamId: 'ENG', status: 'current', number: 1 } as unknown as Cycle;
   useWorkspaceStore.setState({
      loaded: true,
      me,
      users: [uMe, uAna, uBob],
      teams: [eng, ops],
      projects: [p1, p2],
      cycles: [cycle],
      initiatives: [initiative],
      views: [view],
   });
}

/** Referências das coleções ANTES do splice — para provar que as outras não mudaram. */
function refs() {
   const s = useWorkspaceStore.getState();
   return {
      users: s.users,
      teams: s.teams,
      projects: s.projects,
      cycles: s.cycles,
      initiatives: s.initiatives,
      views: s.views,
      me: s.me,
   };
}
type Refs = ReturnType<typeof refs>;
function expectUntouched(before: Refs, except: (keyof Refs)[]) {
   const after = refs();
   for (const key of Object.keys(before) as (keyof Refs)[]) {
      if (except.includes(key)) continue;
      expect(after[key], `${key} não devia ter mudado`).toBe(before[key]);
   }
}

const st = () => useWorkspaceStore.getState();

describe('workspace-store — splice por entidade', () => {
   beforeEach(seed);

   describe('team', () => {
      it('applyTeam de um time NOVO (TeamDto sem members) semeia o criador como membro', () => {
         const before = refs();
         st().applyTeam(teamDto('NEW'));
         const created = st().getTeamById('NEW')!;
         expect(created.name).toBe('Team NEW');
         expect(created.joined).toBe(true);
         expect(created.members.map((m) => m.id)).toEqual(['me']);
         expect(created.projects).toEqual([]);
         expect(st().getUserById('me')?.teamIds).toEqual(['ENG', 'NEW']);
         expect(st().me?.teamIds).toEqual(['ENG', 'NEW']);
         expectUntouched(before, ['teams', 'users', 'me']);
      });

      it('applyTeam de um time EXISTENTE preserva members/projects e não mexe em users', () => {
         const before = refs();
         st().applyTeam(
            teamDto('ENG', { name: 'Engineering', icon: '🚀', estimateScale: 'tshirt' })
         );
         const eng = st().getTeamById('ENG')!;
         expect(eng.name).toBe('Engineering');
         expect(eng.icon).toBe('🚀');
         expect(eng.estimateScale).toBe('tshirt');
         expect(eng.members).toBe(before.teams[0].members);
         expect(eng.projects).toBe(before.teams[0].projects);
         expect(st().getTeamById('OPS')).toBe(before.teams[1]);
         expectUntouched(before, ['teams']);
      });

      it('removeTeamLocal tira o time e o id dos teamIds de users/me', () => {
         const before = refs();
         st().removeTeamLocal('ENG');
         expect(st().teams.map((t) => t.id)).toEqual(['OPS']);
         expect(st().getUserById('me')?.teamIds).toEqual([]);
         expect(st().getUserById('bob')).toBe(before.users[2]); // não era membro: mesma ref
         expect(st().me?.teamIds).toEqual([]);
         expectUntouched(before, ['teams', 'users', 'me']);
      });

      it('applyTeamMembers substitui a lista: quem entrou ganha o time, quem saiu perde', () => {
         const before = refs();
         // bob entrou, ana saiu, me ficou.
         st().applyTeamMembers('ENG', [member('me', ['ENG']), member('bob', ['ENG'])]);
         const eng = st().getTeamById('ENG')!;
         expect(eng.members.map((m) => m.id).sort()).toEqual(['bob', 'me']);
         expect(eng.joined).toBe(true);
         expect(st().getUserById('bob')?.teamIds).toEqual(['ENG']);
         expect(st().getUserById('ana')?.teamIds).toEqual([]);
         expect(st().getTeamById('OPS')).toBe(before.teams[1]);
         expectUntouched(before, ['teams', 'users', 'me']);
      });

      it('applyTeamMembers sem o usuário atual (leave) marca joined=false e limpa me.teamIds', () => {
         st().applyTeamMembers('ENG', [member('ana', ['ENG'])]);
         expect(st().getTeamById('ENG')?.joined).toBe(false);
         expect(st().me?.teamIds).toEqual([]);
         expect(st().getUserById('me')?.teamIds).toEqual([]);
      });
   });

   describe('cycle', () => {
      it('applyCycle insere/atualiza só em cycles', () => {
         const before = refs();
         st().applyCycle(cycleDto('c2', 'ENG'));
         expect(st().cycles.map((c) => c.id)).toEqual(['c1', 'c2']);
         st().applyCycle(cycleDto('c2', 'ENG', { name: 'Sprint 2', status: 'current' }));
         expect(st().cycles).toHaveLength(2);
         expect(st().getCycleById('c2')?.name).toBe('Sprint 2');
         expect(st().getCycleById('c2')?.status).toBe('current');
         expectUntouched(before, ['cycles']);
      });

      it('removeCycleLocal remove só de cycles', () => {
         const before = refs();
         st().removeCycleLocal('c1');
         expect(st().cycles).toEqual([]);
         expectUntouched(before, ['cycles']);
      });
   });

   describe('view', () => {
      it('applyView resolve o owner a partir de users e mexe só em views', () => {
         const before = refs();
         st().applyView(viewDto('v2', 'bob'));
         expect(st().getViewById('v2')?.owner).toBe(before.users[2]);
         st().applyView(viewDto('v1', 'ana', { name: 'Renamed', teamId: 'ENG' }));
         expect(st().views).toHaveLength(2);
         expect(st().getViewById('v1')?.name).toBe('Renamed');
         expect(st().getViewById('v1')?.teamId).toBe('ENG');
         expectUntouched(before, ['views']);
      });

      it('removeViewLocal remove só de views', () => {
         const before = refs();
         st().removeViewLocal('v1');
         expect(st().views).toEqual([]);
         expectUntouched(before, ['views']);
      });
   });

   describe('user', () => {
      it('applyUser atualiza users, a membership em teams e o owner de initiatives/views', () => {
         const before = refs();
         // ana muda de role, sai de ENG e entra em OPS.
         st().applyUser(member('ana', ['OPS'], { role: 'Admin', name: 'Ana Admin' }));
         const ana = st().getUserById('ana')!;
         expect(ana.role).toBe('Admin');
         expect(ana.name).toBe('Ana Admin');
         expect(
            st()
               .getTeamById('ENG')
               ?.members.map((m) => m.id)
         ).toEqual(['me']);
         expect(
            st()
               .getTeamById('OPS')
               ?.members.map((m) => m.id)
         ).toEqual(['ana']);
         // usersById usado por initiatives/views aponta para o User novo
         expect(st().getInitiativeById('i1')?.owner).toBe(ana);
         expect(st().getViewById('v1')?.owner).toBe(ana);
         expectUntouched(before, ['users', 'teams', 'initiatives', 'views']);
      });

      it('applyUser de quem não é owner de nada não recria initiatives/views', () => {
         const before = refs();
         st().applyUser(member('bob', [], { role: 'Guest' }));
         expect(st().getUserById('bob')?.role).toBe('Guest');
         expectUntouched(before, ['users']);
      });

      it('applyUser do usuário atual reflete em me (sem tocar em admin)', () => {
         st().applyUser(member('me', ['ENG'], { role: 'Member', name: 'Renamed me' }));
         expect(st().me?.name).toBe('Renamed me');
         expect(st().me?.role).toBe('Member');
         expect(st().me?.admin).toBe(true);
      });

      it('applyMe troca me e atualiza o User correspondente preservando timezone/presença', () => {
         const before = refs();
         st().applyMe({ ...me, name: 'New name', avatarUrl: 'https://cdn/x.png' });
         expect(st().me?.name).toBe('New name');
         const u = st().getUserById('me')!;
         expect(u.name).toBe('New name');
         expect(u.avatarUrl).toBe('https://cdn/x.png');
         expect(u.timezone).toBe('America/Sao_Paulo');
         expect(u.status).toBe('online');
         expect(
            st()
               .getTeamById('ENG')
               ?.members.find((m) => m.id === 'me')
         ).toBe(u);
         expectUntouched(before, ['users', 'teams', 'me']);
      });
   });

   describe('project / initiative — cópias derivadas', () => {
      it('applyProject novo entra em teams[].projects e no projectIds da initiative', () => {
         const before = refs();
         st().applyProject(projectDto('p3', 'ENG', 'i1'));
         expect(
            st()
               .getTeamById('ENG')
               ?.projects.map((p) => p.id)
         ).toEqual(['p1', 'p2', 'p3']);
         expect(st().getInitiativeById('i1')?.projectIds).toEqual(['p1', 'p3']);
         expect(st().getTeamById('OPS')).toBe(before.teams[1]);
         expectUntouched(before, ['projects', 'teams', 'initiatives']);
      });

      it('applyProject que desvincula a initiative tira o id do projectIds', () => {
         const before = refs();
         st().applyProject(projectDto('p1', 'ENG', null));
         expect(st().getInitiativeById('i1')?.projectIds).toEqual([]);
         // pertinência ao time não mudou → teams intacto
         expect(st().teams).toBe(before.teams);
      });

      it('applyInitiative espelha projectIds em projects[].initiative', () => {
         const before = refs();
         st().applyInitiative(initiativeDto('i1', 'ana', ['p2']));
         expect(st().getProjectById('p1')?.initiative).toBeUndefined();
         expect(st().getProjectById('p2')?.initiative).toBe('i1');
         expect(st().getInitiativeById('i1')?.owner).toBe(before.users[1]);
         expectUntouched(before, ['projects', 'initiatives']);
      });

      it('removeProjectLocal / removeInitiativeLocal limpam as cópias derivadas', () => {
         st().removeProjectLocal('p1');
         expect(
            st()
               .getTeamById('ENG')
               ?.projects.map((p) => p.id)
         ).toEqual(['p2']);
         expect(st().getInitiativeById('i1')?.projectIds).toEqual([]);
         st().applyInitiative(initiativeDto('i1', null, ['p2']));
         st().removeInitiativeLocal('i1');
         expect(st().initiatives).toEqual([]);
         expect(st().getProjectById('p2')?.initiative).toBeUndefined();
      });
   });
});
