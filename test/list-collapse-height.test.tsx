// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { VirtualIssueList } from '@/components/common/issues/virtual-issue-list';
import { GroupIssues } from '@/components/common/issues/group-issues';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useViewTypeStore } from '@/store/view-store';

/**
 * Linha removida perto do fim com a lista rolada até o fundo: a altura total caía na hora,
 * o navegador fazia o clamp do `scrollTop` e as vizinhas saltavam. Na janela do
 * `useListMotion` a altura total recolhe com a mesma transição do `.list-move`.
 */

vi.mock('@/lib/client', () => ({ api: { issues: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});

const make = (n: number): Issue => ({
   id: `i${n}`,
   identifier: `ENG-${n}`,
   title: `Issue ${n}`,
   description: '',
   status: status[0],
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: String(n),
   teamId: 'ENG',
});

const group = { id: 'g1', name: 'Todo', icon: null };
const three = [make(1), make(2), make(3)];
const two = [make(1), make(2)];

let now = 1000;
beforeEach(() => {
   seedCatalog();
   useWorkspaceStore.setState({ users: [], projects: [], cycles: [] });
   useIssuesStore.setState({ issues: three });
   now = 1000;
   vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => {
   vi.restoreAllMocks();
   useViewTypeStore.setState({ viewTypeByView: {} });
});

/** O div que dá a altura total do scroll (filho direto do scroller). */
const sizer = (container: HTMLElement) =>
   container.querySelector('.overflow-y-auto > div[style*="height"]') as HTMLElement;

describe('altura total recolhe com a animação de saída', () => {
   it('lista virtual: a altura nova transiciona só na janela do motion', () => {
      const ui = (issues: Issue[]) => <VirtualIssueList entries={[{ group, issues }]} />;
      const { container, rerender } = render(ui(three));
      expect(sizer(container).style.height).toBe(`${36 + 3 * 44}px`);
      expect(sizer(container).classList.contains('list-collapse')).toBe(false);

      rerender(ui(two));
      expect(sizer(container).style.height).toBe(`${36 + 2 * 44}px`);
      expect(sizer(container).classList.contains('list-collapse')).toBe(true);

      // Depois da janela a altura volta a ser imediata.
      now += 1000;
      rerender(ui([...two]));
      expect(sizer(container).classList.contains('list-collapse')).toBe(false);
   });

   it('lista virtual: lote grande troca a altura na hora (sem transição)', () => {
      const many = Array.from({ length: 20 }, (_, n) => make(n + 1));
      const ui = (issues: Issue[]) => <VirtualIssueList entries={[{ group, issues }]} />;
      const { container, rerender } = render(ui(many));
      rerender(ui(many.slice(0, 5)));
      expect(sizer(container).classList.contains('list-collapse')).toBe(false);
   });

   it('coluna do board: mesma mecânica', () => {
      useViewTypeStore.setState({ viewTypeByView: { 'team/ENG/all': 'grid' } });
      const ui = (issues: Issue[]) => (
         <DndProvider backend={HTML5Backend}>
            <GroupIssues group={group} issues={issues} count={issues.length} />
         </DndProvider>
      );
      const { container, rerender } = render(ui(three));
      expect(sizer(container).classList.contains('list-collapse')).toBe(false);
      rerender(ui(two));
      expect(sizer(container).classList.contains('list-collapse')).toBe(true);
   });

   it('CSS: mesma duração/curva do .list-move e imediato em reduced-motion', () => {
      const css = readFileSync('app/globals.css', 'utf8');
      expect(css).toMatch(
         /\.list-collapse \{\s*transition: height var\(--dur-base\) var\(--ease-std\);/
      );
      const reduced = [
         ...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g),
      ]
         .map((m) => m[1])
         .join('\n');
      expect(reduced).toMatch(/\.list-collapse \{\s*transition: none;/);
   });
});
