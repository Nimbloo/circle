import { Priority } from './priorities';
import { Health } from './projects';
import { User } from './users';
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
   /** Sub-initiatives (#100): parent id (null when top-level) and direct children. */
   parentId: string | null;
   childIds: string[];
   /** Rollup over the whole subtree (this initiative + descendants). */
   rollupProjectCount: number;
   rollupCompletedProjectCount: number;
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

/**
 * Workspace initiatives (Linear "Initiatives" page). Fake data around the
 * LNDev UI component-library storyline; projects reference mock-data/projects.
 */
export const initiatives: Initiative[] = [];
