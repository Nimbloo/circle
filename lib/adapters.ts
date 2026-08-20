/**
 * Adapters API DTO -> tipos ricos do frontend. A API carrega os DADOS (ids + valores);
 * os catálogos locais carregam a PRESENTAÇÃO UI-only (ícones React de status/priority/
 * project). Mesclamos por id — os componentes seguem recebendo o tipo `Issue`/`Project`
 * rico, sem mudança. Para dados demo (= os próprios mock-data) tudo resolve com ícone.
 */
import { Circle } from 'lucide-react';
import { status as statusCatalog, Status } from '@/mock-data/status';
import { priorities as priorityCatalog, Priority } from '@/mock-data/priorities';
import { projects as projectCatalog, Project } from '@/mock-data/projects';
import { users as userCatalog, User } from '@/mock-data/users';
import type { Issue } from '@/mock-data/issues';
import type { IssueDto, UserRef, ProjectRef } from '@/lib/api/issues';

const statusById = new Map(statusCatalog.map((s) => [s.id, s]));
const priorityById = new Map(priorityCatalog.map((p) => [p.id, p]));
const projectById = new Map(projectCatalog.map((p) => [p.id, p]));
const userById = new Map(userCatalog.map((u) => [u.id, u]));

function adaptStatus(s: IssueDto['status']): Status {
   return (
      statusById.get(s.id) ?? {
         id: s.id,
         name: s.name,
         color: s.color,
         category: s.category as Status['category'],
         icon: Circle,
      }
   );
}

function adaptPriority(p: IssueDto['priority']): Priority {
   return (
      priorityById.get(p.id) ?? {
         id: p.id,
         name: p.name,
         icon: Circle as unknown as Priority['icon'],
      }
   );
}

export function adaptUser(u: UserRef): User {
   return (
      userById.get(u.id) ?? {
         id: u.id,
         name: u.name,
         email: u.email,
         avatarUrl: u.avatarUrl ?? '',
         status: 'offline',
         role: 'Member',
         joinedDate: '2026-01-01',
         teamIds: [],
         timezone: 'UTC',
      }
   );
}

function adaptProject(p: ProjectRef): Project | undefined {
   return projectById.get(p.id);
}

/** IssueDto (backend) -> Issue (frontend, com ícones dos catálogos). */
export function adaptIssue(dto: IssueDto): Issue {
   return {
      id: dto.id,
      identifier: dto.identifier,
      title: dto.title,
      description: '',
      status: adaptStatus(dto.status),
      assignee: dto.assignee ? adaptUser(dto.assignee) : null,
      priority: adaptPriority(dto.priority),
      labels: dto.labels,
      createdAt: dto.createdAt,
      cycleId: dto.cycleId,
      project: dto.project ? adaptProject(dto.project) : undefined,
      rank: dto.rank,
      dueDate: dto.dueDate ?? undefined,
      createdById: dto.createdBy?.id ?? undefined,
   };
}

export function adaptIssues(dtos: IssueDto[]): Issue[] {
   return dtos.map(adaptIssue);
}
