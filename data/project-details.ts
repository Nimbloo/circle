import { ContentBlock } from './issue-details';
import { User } from './users';
import type { EditorDoc } from '@/lib/editor-doc';

/* -------------------------------------------------------------------------- */
/*                                 Interfaces                                 */
/* -------------------------------------------------------------------------- */

export interface ProjectMilestone {
   id: string;
   name: string;
   targetDate?: string;
   completed: boolean;
}

export type ProjectUpdateHealth = 'on-track' | 'at-risk' | 'off-track';

export const projectUpdateHealthLabel: Record<ProjectUpdateHealth, string> = {
   'on-track': 'On track',
   'at-risk': 'At risk',
   'off-track': 'Off track',
};

export const projectUpdateHealthColor: Record<ProjectUpdateHealth, string> = {
   'on-track': 'var(--health-on-track)',
   'at-risk': 'var(--health-at-risk)',
   'off-track': 'var(--health-off-track)',
};

/** A posted project update (the "Activity" tab timeline). */
export interface ProjectUpdate {
   id: string;
   author: User;
   date: string; // ISO date
   health: ProjectUpdateHealth;
   blocks: ContentBlock[];
}

/** Lightweight activity event ("x added themselves as a member…"). */
export interface ProjectActivityEvent {
   id: string;
   user: User;
   date: string;
   text: string;
}

export interface ProjectResource {
   id: string;
   label: string;
   url: string;
}

export interface ProjectDetail {
   projectId: string;
   /** One-line summary shown under the project name. */
   summary: string;
   description: ContentBlock[];
   /** Doc do editor de blocos; null = derivar de `description` (`blocksToDoc`). */
   descriptionDoc?: EditorDoc | null;
   resources: ProjectResource[];
   milestones: ProjectMilestone[];
   updates: ProjectUpdate[];
   activity: ProjectActivityEvent[];
}
