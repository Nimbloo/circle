/** Adapters das entidades de referência: API DTO -> tipos ricos do frontend. */
import { Cuboid } from 'lucide-react';
import { status as statusCatalog, Status } from '@/data/status';
import { priorities as priorityCatalog, Priority } from '@/data/priorities';
import { User } from '@/data/users';
import { Health, Project } from '@/data/projects';
import { Team } from '@/data/teams';
import { Cycle } from '@/data/cycles';
import { Initiative } from '@/data/initiatives';
import { View } from '@/data/views';
import type { ProjectDto } from '@/lib/api/projects';
import type { TeamFull } from '@/lib/api/workspace';
import type { MemberDto } from '@/lib/api/members';
import type { CycleDto } from '@/lib/api/cycles';
import type { InitiativeDto } from '@/lib/api/initiatives';
import type { ViewDto } from '@/lib/api/views';

const statusById = new Map(statusCatalog.map((s) => [s.id, s]));
const priorityById = new Map(priorityCatalog.map((p) => [p.id, p]));

/**
 * Owner sintético quando o ownerId não está no mapa de members (ex.: membro removido).
 * Preserva o id e evita `{} as User` — a UI lê `owner.name` sem quebrar.
 */
function fallbackUser(id: string): User {
   return {
      id,
      name: '—',
      email: '',
      avatarUrl: '',
      status: 'offline',
      role: 'Member',
      joinedDate: '',
      teamIds: [],
      timezone: 'UTC',
   };
}

function toStatus(s: { id: string; name: string; color: string; category: string }): Status {
   return (
      statusById.get(s.id) ?? {
         id: s.id,
         name: s.name,
         color: s.color,
         category: s.category as Status['category'],
         icon: Cuboid,
      }
   );
}
function toPriority(p: { id: string; name: string }): Priority {
   return (
      priorityById.get(p.id) ?? {
         id: p.id,
         name: p.name,
         icon: Cuboid as unknown as Priority['icon'],
      }
   );
}
function toHealth(h: {
   id: string;
   name: string;
   color: string;
   description: string | null;
}): Health {
   return {
      id: h.id as Health['id'],
      name: h.name,
      color: h.color,
      description: h.description ?? '',
   };
}

export function adaptMemberToUser(m: MemberDto): User {
   return {
      id: m.id,
      name: m.name,
      email: m.email,
      slug: m.slug,
      avatarUrl: m.avatarUrl ?? '',
      status: (m.presence as User['status']) ?? 'offline',
      role: (m.role as User['role']) ?? 'Member',
      joinedDate: m.joinedAt,
      teamIds: m.teamIds,
      timezone: m.timezone ?? 'UTC',
   };
}

export function adaptProject(p: ProjectDto): Project {
   return {
      id: p.id,
      name: p.name,
      status: toStatus(p.status),
      icon: Cuboid,
      percentComplete: p.percentComplete,
      startDate: p.startDate ?? '',
      targetDate: p.targetDate ?? undefined,
      lead: p.lead
         ? {
              id: p.lead.id,
              name: p.lead.name,
              email: p.lead.email,
              avatarUrl: p.lead.avatarUrl ?? '',
              status: 'offline',
              role: 'Member',
              joinedDate: '2026-01-01',
              teamIds: [],
              timezone: 'UTC',
           }
         : // Sem lead: null honesto (Project.lead: User|null; a UI trata com guard).
           null,
      priority: toPriority(p.priority),
      health: toHealth(p.health),
      teamId: p.teamId,
      labels: p.labels,
      initiative: p.initiativeId ?? undefined,
      healthUpdatedAgoDays: p.healthUpdatedAgoDays ?? undefined,
      issueCount: p.issueCount,
   };
}

export function adaptTeam(t: TeamFull): Team {
   return {
      id: t.id,
      name: t.name,
      icon: t.icon ?? '📁',
      joined: t.joined,
      color: t.color ?? '#8f9299',
      members: t.members.map(adaptMemberToUser),
      projects: t.projects.map(adaptProject),
   };
}

export function adaptCycle(c: CycleDto): Cycle {
   return {
      id: c.id,
      number: c.number,
      name: c.name,
      teamId: c.teamId,
      status: c.status as Cycle['status'],
      startDate: c.startDate,
      endDate: c.endDate,
      capacity: c.capacity,
      scope: c.scope,
      scopeDelta: c.scopeDelta,
      started: c.started,
      completed: c.completed,
      successRate: c.successRate ?? undefined,
      burnup: c.burnup ?? undefined,
   };
}

export function adaptInitiative(i: InitiativeDto, users: Map<string, User>): Initiative {
   return {
      id: i.id,
      name: i.name,
      description: i.description ?? undefined,
      icon: i.icon ?? '🎯',
      status: i.status as Initiative['status'],
      priority: toPriority(i.priority),
      owner: i.owner ? users.get(i.owner.id) : undefined,
      target: i.target ?? undefined,
      health: toHealth(i.health),
      projectIds: i.projectIds,
      createdAt: i.createdAt,
   };
}

export function adaptView(v: ViewDto, users: Map<string, User>): View {
   return {
      id: v.id,
      name: v.name,
      description: v.description ?? '',
      icon: v.icon ?? '🔍',
      type: v.type as View['type'],
      teamId: v.teamId ?? undefined,
      owner: users.get(v.ownerId) ?? fallbackUser(v.ownerId),
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      filter: v.filter as View['filter'],
   };
}
