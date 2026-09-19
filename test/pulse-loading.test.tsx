// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import PulseSettings from '@/components/common/settings/pulse-settings';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useIssuesStore } from '@/store/issues-store';
import type { Issue } from '@/data/issues';

Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});

const mount = () =>
   render(
      <SidebarProvider>
         <PulseSettings />
      </SidebarProvider>
   );

const issue = { id: 'i1', teamId: 'CORE', status: { category: 'started' } } as unknown as Issue;

beforeEach(() => {
   useIssuesStore.setState({ issues: [], loading: false, loaded: false, error: false });
});

/** Ad#32 — o pulse mostrava "0 issues" subindo aos poucos durante a hidratação. */
describe('Pulse (Ad#32)', () => {
   it('mostra carregando enquanto as issues não terminaram de hidratar', () => {
      useIssuesStore.setState({ issues: [issue], loading: true, loaded: false });
      mount();
      expect(screen.getByRole('status', { name: /Carregando/i })).toBeTruthy();
      expect(screen.queryByText('Total de issues')).toBeNull();
   });

   it('mostra os números quando a carga termina', () => {
      useIssuesStore.setState({ issues: [issue], loading: false, loaded: true });
      mount();
      expect(screen.getByText('Total de issues')).toBeTruthy();
      expect(screen.queryByRole('status', { name: /Carregando/i })).toBeNull();
   });

   it('falha na carga vira erro com retry, não zeros', () => {
      useIssuesStore.setState({ issues: [], loading: false, loaded: false, error: true });
      mount();
      expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
      expect(screen.queryByText('Total de issues')).toBeNull();
   });
});
