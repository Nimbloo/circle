// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

vi.mock('@/lib/client', () => ({
   api: { search: { query: vi.fn(async () => ({ groups: [] })) } },
}));
vi.mock('next/navigation', () => ({
   usePathname: () => '/nimbloo/team/ENG/all',
   useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CommandPalette } from '@/components/layout/command-palette';

const openPalette = () => fireEvent.keyDown(window, { key: 'k', metaKey: true });

beforeEach(() => {
   useIssuesStore.setState({ issues: [] });
   useWorkspaceStore.setState({ projects: [], users: [], cycles: [], teams: [], me: null });
});

/**
 * co#8 (mapeado no sanity-audit-4, pr-40): a dica "Perguntar ao Agent · Tab" ficava
 * sobreposta ao texto digitado — o `pr-40` reservava menos espaço do que a dica
 * realmente ocupa. Em vez de reservar largura em px (frágil, depende de fonte/idioma),
 * a dica só aparece com o campo vazio: não há texto pra sobrepor, e Tab continua
 * funcionando mesmo com o campo preenchido.
 */
describe('CommandPalette — dica "Perguntar ao Agent" não sobrepõe o texto digitado', () => {
   it('some assim que o usuário digita algo', () => {
      render(<CommandPalette />);
      openPalette();
      const input = screen.getByPlaceholderText(/Digite um comando ou pesquise/i);
      expect(screen.getByText('Perguntar ao Agent')).toBeTruthy();

      fireEvent.change(input, { target: { value: 'tema' } });
      expect(screen.queryByText('Perguntar ao Agent')).toBeNull();
   });

   it('Tab ainda leva pro Agent mesmo com o campo vazio', () => {
      render(<CommandPalette />);
      openPalette();
      expect(screen.getByText('Perguntar ao Agent')).toBeTruthy();
   });
});
