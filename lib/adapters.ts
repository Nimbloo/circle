/**
 * Adapters API DTO -> tipos ricos do frontend. A API carrega os DADOS (ids + valores);
 * o frontend só acrescenta a PRESENTAÇÃO (ícones React). Nada vem de catálogo mock
 * (#16): status novo ou renomeado no servidor aparece com o nome/cor/ícone do DTO.
 */
import { Circle, Cuboid } from 'lucide-react';
import { Status, StatusCategory, statusIconFor } from '@/data/status';
import { priorities as priorityPresentation, Priority } from '@/data/priorities';
import { health as healthCatalog, Project } from '@/data/projects';
import { User } from '@/data/users';
import type { Issue } from '@/data/issues';
import type { IssueDto, UserRef, ProjectRef } from '@/lib/api/issues';
import { useCatalogStore } from '@/store/catalog-store';

const priorityById = new Map(priorityPresentation.map((p) => [p.id, p]));

/**
 * Status do DTO -> Status rico. Usa o objeto do catálogo (mesma referência, ícone com o
 * "pie" da posição) quando ele bate com o DTO; senão monta do próprio DTO — status
 * criado depois do bootstrap ou renomeado agora não fica sem ícone nem com nome velho.
 */
export function adaptStatus(s: {
   id: string;
   name: string;
   color: string;
   category: string;
}): Status {
   const catalog = useCatalogStore.getState();
   const known =
      catalog.statuses.find((x) => x.id === s.id) ??
      catalog.projectStatuses.find((x) => x.id === s.id);
   if (known && known.name === s.name && known.color === s.color && known.category === s.category)
      return known;
   const category = s.category as StatusCategory;
   return {
      id: s.id,
      name: s.name,
      color: s.color,
      category,
      icon: statusIconFor(category, s.color, undefined, s.name),
   };
}

export function adaptPriority(p: { id: string; name: string }): Priority {
   return (
      priorityById.get(p.id) ?? {
         id: p.id,
         name: p.name,
         icon: Circle as unknown as Priority['icon'],
      }
   );
}

export function adaptUser(u: UserRef): User {
   return {
      id: u.id,
      name: u.name,
      email: u.email,
      slug: u.slug,
      avatarUrl: u.avatarUrl ?? '',
      status: 'offline',
      role: 'Member',
      joinedDate: '2026-01-01',
      teamIds: [],
      timezone: 'UTC',
   };
}

const DEFAULT_HEALTH = healthCatalog.find((h) => h.id === 'no-update') ?? healthCatalog[0];

/** Status neutro do Project fino (o ref embutido na issue não traz o status do projeto). */
const UNKNOWN_PROJECT_STATUS: Status = {
   id: '',
   name: '',
   color: 'var(--muted-foreground)',
   category: 'backlog',
   icon: statusIconFor('backlog', 'var(--muted-foreground)'),
};

/**
 * ProjectRef (embutido na issue) -> Project fino a partir do ref (id/name/ícone) com
 * defaults seguros. Independente de ordem de hydrate (não consulta o workspace store).
 */
function adaptProject(p: ProjectRef): Project {
   return {
      id: p.id,
      name: p.name,
      status: UNKNOWN_PROJECT_STATUS,
      icon: Cuboid,
      percentComplete: 0,
      startDate: '',
      // Ref de projeto embutido na issue não carrega lead — null honesto (Project.lead: User|null).
      lead: null,
      priority: adaptPriority({ id: 'no-priority', name: 'No priority' }),
      health: DEFAULT_HEALTH,
      teamId: '',
      labels: [],
   };
}

/** IssueDto (backend) -> Issue (frontend, com ícones dos catálogos). */
export function adaptIssue(dto: IssueDto): Issue {
   return {
      id: dto.id,
      identifier: dto.identifier,
      teamId: dto.teamId,
      title: dto.title,
      description: '',
      status: adaptStatus(dto.status),
      assignee: dto.assignee ? adaptUser(dto.assignee) : null,
      assignees: (dto.assignees ?? []).map(adaptUser),
      priority: adaptPriority(dto.priority),
      labels: dto.labels,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
      cycleId: dto.cycleId,
      project: dto.project ? adaptProject(dto.project) : undefined,
      rank: dto.rank,
      dueDate: dto.dueDate ?? undefined,
      estimate: dto.estimate ?? undefined,
      subIssueCount: dto.subIssueCount,
      subIssueDoneCount: dto.subIssueDoneCount,
      parentId: dto.parentId ?? null,
      parentIdentifier: dto.parentIdentifier ?? null,
      snoozedUntil: dto.snoozedUntil,
      slaAppliedAt: dto.slaAppliedAt ?? null,
      slaDueAt: dto.slaDueAt ?? null,
      createdById: dto.createdBy?.id ?? undefined,
   };
}

export function adaptIssues(dtos: IssueDto[]): Issue[] {
   return dtos.map(adaptIssue);
}
