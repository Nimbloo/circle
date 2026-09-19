import { describe, expect, it } from 'vitest';
import { groupInitiativeProjects } from '@/components/common/initiatives/initiative-project-groups';
import { statusIconFor, type StatusCategory } from '@/data/status';
import type { Project } from '@/data/projects';
import { makeProject } from './helpers/project-fixture';

const withCategory = (id: string, category: StatusCategory): Project =>
   makeProject({
      id,
      status: {
         id: `proj-${category}`,
         name: category,
         color: '#000000',
         category,
         icon: statusIconFor(category, '#000000', undefined, category),
      },
   });

/** pl#3: a seção Projects da initiative escondia Planned e Canceled (categorias reais). */
describe('grupos de projetos da initiative (pl#3)', () => {
   it('mostra todo projeto vinculado, inclusive planned e canceled', () => {
      const projects: Project[] = [
         withCategory('a', 'started'),
         withCategory('b', 'planned'),
         withCategory('c', 'unstarted'),
         withCategory('d', 'backlog'),
         withCategory('e', 'completed'),
         withCategory('f', 'canceled'),
      ];
      const groups = groupInitiativeProjects(projects);
      expect(groups.flatMap((g) => g.projects.map((p) => p.id)).sort()).toEqual([
         'a',
         'b',
         'c',
         'd',
         'e',
         'f',
      ]);
      expect(groups.map((g) => g.label)).toEqual([
         'In Progress',
         'Planned',
         'Backlog',
         'Completed',
         'Canceled',
      ]);
      expect(groups.find((g) => g.key === 'planned')?.projects.map((p) => p.id)).toEqual([
         'b',
         'c',
      ]);
   });

   it('grupo vazio não vira seção', () => {
      expect(groupInitiativeProjects([withCategory('a', 'canceled')]).map((g) => g.key)).toEqual([
         'canceled',
      ]);
   });
});
