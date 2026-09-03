import { beforeEach, describe, expect, it } from 'vitest';
import { Circle } from 'lucide-react';
import type { StatusDto } from '@/lib/api/statuses';
import { useCatalogStore } from '@/store/catalog-store';

const st = () => useCatalogStore.getState();

function statusDto(id: string, position: number, extra: Partial<StatusDto> = {}): StatusDto {
   return { id, name: `Status ${id}`, color: '#888', category: 'backlog', position, ...extra };
}

function seed() {
   useCatalogStore.setState({
      loaded: true,
      statuses: [
         { id: 'todo', name: 'Todo', color: '#aaa', category: 'unstarted', icon: Circle },
         {
            id: 'in-progress',
            name: 'In Progress',
            color: '#ff0',
            category: 'started',
            icon: Circle,
         },
      ],
      labels: [
         { id: 'bug', name: 'Bug', color: '#f00', groupId: 'type' },
         { id: 'ux', name: 'UX', color: '#0f0', groupId: null },
      ],
   });
}

/** Referências das coleções que NÃO devem mudar num splice. */
function refs() {
   const s = st();
   return {
      statuses: s.statuses,
      projectStatuses: s.projectStatuses,
      priorities: s.priorities,
      labels: s.labels,
      healthStates: s.healthStates,
   };
}
type Refs = ReturnType<typeof refs>;
function expectUntouched(before: Refs, except: (keyof Refs)[]) {
   const after = refs();
   for (const key of Object.keys(before) as (keyof Refs)[]) {
      if (except.includes(key)) continue;
      expect(after[key], `${key} não devia ter mudado`).toBe(before[key]);
   }
}

describe('catalog-store — splice por item', () => {
   beforeEach(seed);

   describe('labels', () => {
      it('applyLabel insere ordenado por nome (mesma ordem da API) e mexe só em labels', () => {
         const before = refs();
         st().applyLabel({ id: 'docs', name: 'Docs', color: '#00f' });
         expect(st().labels.map((l) => l.id)).toEqual(['bug', 'docs', 'ux']);
         expectUntouched(before, ['labels']);
      });

      it('applyLabel de um existente preserva o groupId (o DTO não traz) e reordena', () => {
         st().applyLabel({ id: 'bug', name: 'Zebra bug', color: '#f0f' });
         const bug = st().labels.find((l) => l.id === 'bug')!;
         expect(bug.name).toBe('Zebra bug');
         expect(bug.color).toBe('#f0f');
         expect(bug.groupId).toBe('type');
         expect(st().labels.map((l) => l.id)).toEqual(['ux', 'bug']);
         expect(st().labels).toHaveLength(2);
      });

      it('removeLabel remove só de labels', () => {
         const before = refs();
         st().removeLabel('bug');
         expect(st().labels.map((l) => l.id)).toEqual(['ux']);
         expectUntouched(before, ['labels']);
      });
   });

   describe('statuses', () => {
      it('applyStatus novo vai pro fim (maior position) com ícone de fallback', () => {
         const before = refs();
         st().applyStatus(statusDto('review', 3, { category: 'started' }));
         expect(st().statuses.map((s) => s.id)).toEqual(['todo', 'in-progress', 'review']);
         expect(st().statuses[2].category).toBe('started');
         expect(st().statuses[2].icon).toBe(Circle);
         expectUntouched(before, ['statuses']);
      });

      it('applyStatus existente troca na mesma casa e mantém o ícone do catálogo mock', () => {
         st().applyStatus(statusDto('in-progress', 1, { name: 'Doing', category: 'started' }));
         expect(st().statuses.map((s) => s.id)).toEqual(['todo', 'in-progress']);
         expect(st().statuses[1].name).toBe('Doing');
         expect(st().statuses[1].icon).not.toBe(Circle);
      });

      it('setStatuses substitui a lista inteira na ordem recebida (reorder)', () => {
         const before = refs();
         st().setStatuses([statusDto('in-progress', 0), statusDto('todo', 1)]);
         expect(st().statuses.map((s) => s.id)).toEqual(['in-progress', 'todo']);
         expectUntouched(before, ['statuses']);
      });

      it('removeStatus remove só de statuses', () => {
         const before = refs();
         st().removeStatus('todo');
         expect(st().statuses.map((s) => s.id)).toEqual(['in-progress']);
         expectUntouched(before, ['statuses']);
      });
   });
});
