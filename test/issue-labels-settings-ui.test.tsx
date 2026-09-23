// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IssueLabelsSettings from '@/components/common/settings/issue-labels-settings';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useCatalogStore } from '@/store/catalog-store';
import { useIssuesStore } from '@/store/issues-store';
import { labels as testLabels } from './helpers/catalog-fixture';

const renderSettings = () =>
   render(
      <SidebarProvider>
         <IssueLabelsSettings />
      </SidebarProvider>
   );

vi.mock('@/lib/client', () => ({
   api: {
      labels: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
      labelGroups: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
   },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
   }),
});

describe('IssueLabelsSettings — grupos (pl mobile audit)', () => {
   beforeEach(() => {
      useIssuesStore.setState({ issues: [] });
      useCatalogStore.setState({
         loaded: true,
         labels: testLabels.slice(0, 2).map((l, i) => ({ ...l, groupId: i === 0 ? 'g1' : null })),
         labelGroups: [{ id: 'g1', name: 'Type', createdAt: '2026-01-01T00:00:00.000Z' } as never],
      });
   });

   it('a linha de grupo (3 ações) não estoura a largura fixa das linhas de label (2 ações)', () => {
      renderSettings();
      const groupRow = screen.getByRole('group', { name: 'Type' }).firstElementChild as HTMLElement;
      const actions = groupRow.querySelector(
         '.flex.shrink-0.items-center.justify-end'
      ) as HTMLElement;
      expect(actions).toBeTruthy();
      // Regressão: a largura NÃO pode mais ser travada em 84px fixos (estourava com
      // os 3 botões de Add/Rename/Delete do grupo).
      expect(actions.className).not.toMatch(/\bw-\[84px\]\b/);
      expect(actions.querySelectorAll('button').length).toBe(3);
   });

   it('o container de labels usa content-enter (fade único, não por linha)', () => {
      renderSettings();
      const card = document.querySelector('.content-enter');
      expect(card).toBeTruthy();
      expect(card?.querySelectorAll('.content-enter').length).toBe(0);
   });
});
