// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineText } from '@/components/common/issues/details/content-blocks';
import type { Team } from '@/data/teams';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));

/**
 * Fr#2: as chaves de time vinham de uma varredura de TODAS as issues dentro do seletor
 * (rodava a cada mudança do issues-store, por bloco de texto). Agora vêm dos times do
 * workspace — o identifier é `<teamId>-<seq>`.
 */
describe('InlineText — identifiers linkados pelos times do workspace', () => {
   beforeEach(() => {
      useIssuesStore.setState({ issues: [] });
      useWorkspaceStore.setState({ teams: [{ id: 'ENG', name: 'Engineering' } as Team] });
   });

   it('linka identifier de time conhecido mesmo sem issues carregadas', () => {
      render(<InlineText text="Ver ENG-12 e OPS-3." />);
      const link = screen.getByRole('link', { name: 'ENG-12' });
      expect(link.getAttribute('href')).toBe('/nimbloo/issue/ENG-12');
      expect(screen.queryByRole('link', { name: 'OPS-3' })).toBeNull();
   });
});
