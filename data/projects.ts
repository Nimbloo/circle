import { Status, status } from './status';
import {
   Accessibility,
   Bell,
   Blocks,
   Bomb,
   BrickWall,
   Cuboid,
   FormInput,
   Globe,
   Grid2X2,
   HelpCircle,
   LayoutDashboard,
   Loader,
   Lock,
   LucideIcon,
   Play,
   Settings,
   Shapes,
   Table,
   TrafficCone,
   Vault,
   Wallpaper,
} from 'lucide-react';
import { RemixiconComponentType } from '@remixicon/react';
import { User, users } from './users';
import { LabelInterface, labels } from './labels';
import { Priority, priorities } from './priorities';
export interface Project {
   id: string;
   name: string;
   status: Status;
   icon: LucideIcon | RemixiconComponentType;
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

type BaseProject = Omit<
   Project,
   'targetDate' | 'teamId' | 'labels' | 'initiative' | 'healthUpdatedAgoDays'
>;

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

const baseProjects: BaseProject[] = [];

/* -------------------------------------------------------------------------- */
/*            Extended, Linear-style attributes (teams, dates, labels)        */
/* -------------------------------------------------------------------------- */

const TEAM_ROTATION = ['CORE', 'DESIGN', 'PERF', 'WEB', 'API', 'ANALYTICS'];

const INITIATIVES = [
   'Q3 — Ship the component platform',
   'Q3 — Raise quality and accessibility',
   'Q4 — Grow design system adoption',
];

const pad = (value: number) => String(value).padStart(2, '0');

/** Deterministic date helper (no Date.now — SSR safe). */
const isoDate = (year: number, month: number, day: number): string => {
   const normalizedYear = year + Math.floor((month - 1) / 12);
   const normalizedMonth = ((month - 1) % 12) + 1;
   return `${normalizedYear}-${pad(normalizedMonth)}-${pad(Math.min(day, 28))}`;
};

export const projects: Project[] = baseProjects.map((project, index) => {
   // Spread active work around mid-2026 so the timeline view reads well.
   const startMonth = 2 + ((index * 5) % 10); // Feb → Nov 2026
   const startDate = isoDate(2026, startMonth, 1 + ((index * 7) % 26));
   const targetDate = isoDate(2026, startMonth + 2 + (index % 4), 1 + ((index * 11) % 26));

   return {
      ...project,
      startDate,
      targetDate,
      teamId: TEAM_ROTATION[index % TEAM_ROTATION.length],
      labels: [labels[index % labels.length]],
      initiative: INITIATIVES[index % INITIATIVES.length],
      healthUpdatedAgoDays: project.health.id === 'no-update' ? undefined : 1 + (index % 9),
   };
});

export function getProjectById(id: string): Project | undefined {
   return projects.find((project) => project.id === id);
}

export function getProjectsByTeam(teamId: string): Project[] {
   return projects.filter((project) => project.teamId === teamId);
}
