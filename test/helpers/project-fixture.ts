import { Cuboid } from 'lucide-react';
import { status as statusCatalog, type Status } from '@/data/status';
import { priorities } from '@/data/priorities';
import { health, type Project } from '@/data/projects';
import type { ProjectDto } from '@/lib/api/projects';

/** Status do catálogo mock do front (mesmo objeto que o adapter devolve por id). */
export function statusOf(id: string): Status {
   const found = statusCatalog.find((s) => s.id === id);
   if (!found) throw new Error(`status '${id}' não existe no catálogo mock`);
   return found;
}

/** Projeto rico da UI com defaults razoáveis (backlog, Sep 1 → Sep 30 2026). */
export function makeProject(overrides: Partial<Project> & { id: string }): Project {
   return {
      name: overrides.id,
      status: statusOf('backlog'),
      icon: Cuboid,
      percentComplete: 0,
      startDate: '2026-09-01',
      targetDate: '2026-09-30',
      lead: null,
      priority: priorities[0],
      health: health[0],
      teamId: 'CORE',
      labels: [],
      ...overrides,
   };
}

/** DTO como o PATCH devolveria — só os campos que `adaptProject` lê. */
export function toProjectDto(p: Project): ProjectDto {
   return {
      id: p.id,
      name: p.name,
      status: {
         id: p.status.id,
         name: p.status.name,
         color: p.status.color,
         category: p.status.category,
      },
      priority: { id: p.priority.id, name: p.priority.name },
      health: {
         id: p.health.id,
         name: p.health.name,
         color: p.health.color,
         description: p.health.description,
      },
      iconKey: null,
      percentComplete: p.percentComplete,
      startDate: p.startDate,
      targetDate: p.targetDate ?? null,
      lead: null,
      teamId: p.teamId,
      initiativeId: null,
      labels: [],
      healthUpdatedAt: null,
      healthUpdatedAgoDays: null,
      issueCount: 0,
   } as unknown as ProjectDto;
}
