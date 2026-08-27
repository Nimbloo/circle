import { Priority } from './priorities';
import { Health } from './projects';
import { User } from './users';

export type InitiativeStatus = 'active' | 'planned' | 'completed';

export interface Initiative {
   id: string;
   name: string;
   description?: string;
   /** Emoji used as the initiative icon. */
   icon: string;
   status: InitiativeStatus;
   priority: Priority;
   owner?: User;
   /** Target label shown in the list ("Q3 2026", "Sep 30th", …). */
   target?: string;
   health: Health;
   projectIds: string[];
   createdAt: string;
}

export const INITIATIVE_STATUS_META: Record<InitiativeStatus, { label: string; color: string }> = {
   active: { label: 'Active', color: '#f2c94c' },
   planned: { label: 'Planned', color: '#95a2b3' },
   completed: { label: 'Completed', color: '#5e6ad2' },
};

/**
 * Placeholder vazio das initiatives do workspace — os dados reais vêm da API e
 * vivem no workspace-store; este array só existe porque o `seed-demo` o itera.
 * Lookups/agregações são feitos pelas selectors do store (getInitiativeById,
 * getInitiativeProjects, countCompletedProjects), não por helpers aqui.
 */
export const initiatives: Initiative[] = [];
