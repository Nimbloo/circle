import { Project, projects } from './projects';
import { User, users } from './users';

export interface Team {
   id: string;
   name: string;
   icon: string;
   joined: boolean;
   color: string;
   estimateScale: string; // fibonacci|exponential|linear|tshirt
   /** Days without a current cycle between one cycle and the next (0-14). */
   cycleCooldownDays: number;
   members: User[];
   projects: Project[];
}

export const teams: Team[] = [];
