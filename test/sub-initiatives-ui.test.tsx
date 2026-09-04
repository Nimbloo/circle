// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { initiativeBreadcrumb, initiativeWithDescendants } from '@/lib/initiative-tree';
import type { Initiative } from '@/data/initiatives';
import { health } from '@/data/projects';
import { priorities } from '@/data/priorities';
import InitiativeDetails from '@/components/common/initiatives/initiative-details';
import { useWorkspaceStore } from '@/store/workspace-store';

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', initiativeId: 'mother' }),
   usePathname: () => '/nimbloo/initiative/mother',
   useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('nuqs', () => ({
   useQueryState: () => ['overview', vi.fn()],
   parseAsStringLiteral: () => ({ withDefault: () => ({}) }),
}));

vi.mock('@/lib/client', () => ({
   api: { initiatives: { update: vi.fn(), get: vi.fn(), activity: vi.fn(async () => []) } },
}));

function initiative(
   id: string,
   name: string,
   parentId: string | null,
   childIds: string[] = [],
   rollup: [number, number] = [0, 0]
): Initiative {
   return {
      id,
      name,
      icon: '🎯',
      status: 'active',
      priority: priorities[0],
      health: health[0],
      labels: [],
      projectIds: [],
      parentId,
      childIds,
      rollupProjectCount: rollup[0],
      rollupCompletedProjectCount: rollup[1],
      createdAt: '2026-01-01T00:00:00.000Z',
   };
}

const MOTHER = initiative('mother', 'Mother', null, ['child'], [4, 2]);
const CHILD = initiative('child', 'Child', 'mother', [], [2, 1]);

describe('sub-initiatives na UI (#100)', () => {
   it('breadcrumb e subárvore derivam de parentId', () => {
      const all = [MOTHER, CHILD];
      expect(initiativeBreadcrumb(all, 'child').map((i) => i.name)).toEqual(['Mother', 'Child']);
      expect(initiativeWithDescendants(all, 'mother').sort()).toEqual(['child', 'mother']);
      expect(initiativeWithDescendants(all, 'child')).toEqual(['child']);
   });

   it('o detalhe lista a sub-initiative com o rollup de projetos', () => {
      useWorkspaceStore.setState({
         initiatives: [MOTHER, CHILD],
         projects: [],
         users: [],
         loaded: true,
      });

      render(<InitiativeDetails initiativeId="mother" />);

      expect(screen.getByRole('heading', { name: 'Sub-initiatives' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Child' }).getAttribute('href')).toBe(
         '/nimbloo/initiative/child'
      );
      expect(screen.getByText('1 / 2 projects')).toBeTruthy();
      expect(screen.getByText('50%')).toBeTruthy();
   });
});
