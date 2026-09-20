// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IssueViewTabs } from '@/components/layout/headers/issues/header-nav';

/**
 * is#23: a página de Triage reaproveitava o header de Issues, mas nenhuma das abas
 * (Active/Backlog/All issues) correspondia à rota — nenhuma ficava ativa. Ganha a
 * aba "Triage".
 */

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', teamId: 'ENG' }),
   usePathname: () => '/nimbloo/team/ENG/triage',
   useSearchParams: () => new URLSearchParams(),
}));

describe('IssueViewTabs — aba Triage (is#23)', () => {
   it('mostra "Triage" e a marca como ativa na rota /team/:id/triage', () => {
      render(<IssueViewTabs />);
      const triageTab = screen.getByText('Triage');
      expect(triageTab.className).toContain('bg-accent');
      expect(triageTab.closest('a')?.getAttribute('href')).toBe('/nimbloo/team/ENG/triage');
   });
});
