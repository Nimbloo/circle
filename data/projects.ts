import { Status } from './status';
import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { User } from './users';
import { LabelInterface } from './labels';
import { Priority } from './priorities';
export interface Project {
   id: string;
   name: string;
   status: Status;
   /** Ícone lucide OU componente SVG custom (ex.: CyclePlayIcon). Antes incluía Remixicon (removido). */
   icon: LucideIcon | ComponentType<{ className?: string }>;
   percentComplete: number;
   startDate: string;
   /** Planned completion date (Linear "Target date"). */
   targetDate?: string;
   /** Project lead. `null` quando a issue/projeto não tem lead definido (dado da API). */
   lead: User | null;
   priority: Priority;
   health: Health;
   /** Owning team (see mock-data/teams.ts). */
   teamId: string;
   labels: LabelInterface[];
   initiative?: string;
   /** Days since the last health update (undefined = no update yet). */
   healthUpdatedAgoDays?: number;
   /** Number of issues in the project (computed by the backend). */
   issueCount?: number;
}

export interface Health {
   id: 'no-update' | 'off-track' | 'on-track' | 'at-risk';
   name: string;
   color: string;
   description: string;
}

export const health: Health[] = [
   {
      id: 'no-update',
      name: 'No Update',
      color: '#8f9299',
      description: 'The project has not been updated in the last 30 days.',
   },
   {
      id: 'off-track',
      name: 'Off Track',
      color: '#eb5757',
      description: 'The project is not on track and may be delayed.',
   },
   {
      id: 'on-track',
      name: 'On Track',
      color: '#4cb782',
      description: 'The project is on track and on schedule.',
   },
   {
      id: 'at-risk',
      name: 'At Risk',
      color: '#f2c94c',
      description: 'The project is at risk and may be delayed.',
   },
];

/** Projetos vêm da API (workspace-store); vazio de propósito (usado só pelo seed demo). */
export const projects: Project[] = [];
