import { Priority, priorities } from './priorities';
import { Health, health, Project, projects } from './projects';
import { User, users } from './users';
import type { LabelInterface } from './labels';

export type InitiativeStatus = 'proposed' | 'planned' | 'active' | 'completed' | 'canceled';

export interface Initiative {
   id: string;
   name: string;
   description?: string;
   /** Glyph key or emoji used as the initiative icon. */
   icon: string;
   iconColor?: string;
   status: InitiativeStatus;
   priority: Priority;
   owner?: User;
   /** Target label shown in the list ("Q3 2026", "Sep 30th", …). */
   target?: string;
   /** ISO `YYYY-MM-DD`; `targetDate` is the real end of the `target` period. */
   startDate?: string;
   targetDate?: string;
   health: Health;
   labels: LabelInterface[];
   projectIds: string[];
   createdAt: string;
}

// Ordem/estados do Linear: Proposed → Planned → Active → Completed → Canceled.
export const INITIATIVE_STATUS_META: Record<InitiativeStatus, { label: string; color: string }> = {
   proposed: { label: 'Proposed', color: '#a1a1aa' },
   planned: { label: 'Planned', color: '#95a2b3' },
   active: { label: 'Active', color: '#f2c94c' },
   completed: { label: 'Completed', color: '#5e6ad2' },
   canceled: { label: 'Canceled', color: '#6b7280' },
};

const noUpdate = health[0];
const byId = (id: string): Health => health.find((entry) => entry.id === id) ?? noUpdate;

/**
 * Workspace initiatives (Linear "Initiatives" page). Fake data around the
 * LNDev UI component-library storyline; projects reference mock-data/projects.
 */
export const initiatives: Initiative[] = [];

export function getInitiativeById(id: string): Initiative | undefined {
   return initiatives.find((initiative) => initiative.id === id);
}

export function getInitiativeProjects(initiative: Initiative): Project[] {
   return initiative.projectIds
      .map((id) => projects.find((project) => project.id === id))
      .filter((project): project is Project => Boolean(project));
}

/** Projects considered "completed" for the n / m counter. */
export function countCompletedProjects(initiative: Initiative): number {
   return getInitiativeProjects(initiative).filter(
      (project) => project.status.category === 'completed' || project.percentComplete >= 100
   ).length;
}
