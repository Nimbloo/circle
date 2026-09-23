// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InitiativeDetails from '@/components/common/initiatives/initiative-details';
import { useWorkspaceStore } from '@/store/workspace-store';
import { health } from '@/data/projects';
import { priorities } from '@/data/priorities';
import type { Initiative } from '@/data/initiatives';

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', initiativeId: 'mother' }),
   usePathname: () => '/nimbloo/initiative/mother',
   useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('nuqs', () => ({
   useQueryState: () => ['activity', vi.fn()],
   parseAsStringLiteral: () => ({ withDefault: () => ({}) }),
}));

const update = {
   id: 'u1',
   author: {
      id: 'u-ana',
      slug: 'ana',
      name: 'Christopher Alexander-Montgomery',
      email: 'a@nimbloo.ai',
      avatarUrl: null,
   },
   health: 'on-track',
   blocks: [{ type: 'paragraph', text: 'progresso' }],
   createdAt: '2026-09-10T12:00:00.000Z',
};

vi.mock('@/lib/client', () => ({
   api: {
      initiatives: {
         update: vi.fn(),
         get: vi.fn(),
         activity: vi.fn(async () => []),
         updates: vi.fn(async () => [update]),
      },
      projectSnapshots: { forInitiative: vi.fn(async () => []) },
   },
}));

const MOTHER: Initiative = {
   id: 'mother',
   name: 'Mother',
   icon: '🎯',
   status: 'active',
   priority: priorities[0],
   health: health[0],
   labels: [],
   projectIds: [],
   parentId: null,
   childIds: [],
   rollupProjectCount: 0,
   rollupCompletedProjectCount: 0,
   createdAt: '2026-01-01T00:00:00.000Z',
};

describe('InitiativeDetails — updates no mobile (390px)', () => {
   it('nome longo do autor trunca em vez de estourar a linha (pl#11 mobile)', async () => {
      useWorkspaceStore.setState({ initiatives: [MOTHER], projects: [], users: [], loaded: true });
      render(<InitiativeDetails initiativeId="mother" />);

      const author = await screen.findByText(/Christopher Alexander-Montgomery/);
      const header = author.closest('div')!;
      expect(header.className).toContain('min-w-0');
      expect(author.className).toContain('truncate');
   });
});
