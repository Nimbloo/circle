// @vitest-environment jsdom

import './setup-dom';
import React, { Profiler } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { MOTION_MS } from '@/lib/motion';

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
const closePalette = () => fireEvent.keyDown(window, { key: 'k', metaKey: true });

beforeEach(() => {
   useIssuesStore.setState({ issues: [] });
   useWorkspaceStore.setState({ projects: [], users: [], cycles: [], teams: [], me: null });
});
afterEach(() => vi.useRealTimers());

/**
 * A palette sai animada (vi#10): a casca fica montada e o corpo sobrevive ao fechamento
 * pelo tempo da saída do dialog. Depois disso ele some — e o estado (rota interna, busca)
 * nasce limpo na abertura seguinte (co#9).
 */
describe('montagem e saída da command palette', () => {
   it('o corpo some depois da saída e o estado reseta ao fechar', async () => {
      vi.useFakeTimers();
      let commits = 0;
      render(
         <Profiler id="palette" onRender={() => commits++}>
            <CommandPalette />
         </Profiler>
      );
      expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();

      openPalette();
      const input = screen.getByPlaceholderText(/Digite um comando ou pesquise/i);
      fireEvent.change(input, { target: { value: 'tema' } });
      expect((input as HTMLInputElement).value).toBe('tema');

      const content = document.querySelector('[data-slot="dialog-content"]')!;
      expect(content.className).toContain('motion-modal');

      closePalette();
      // Durante a saída o corpo segue montado (sem ele o dialog não teria o que animar).
      // No jsdom o Radix desmonta o conteúdo na hora (não há CSS): o que dá para observar é
      // o corpo ainda assinando o store. A animação em si só se valida no navegador.
      commits = 0;
      act(() => useIssuesStore.setState({ issues: [] }));
      expect(commits).toBeGreaterThan(0);

      act(() => vi.advanceTimersByTime(MOTION_MS.fast + 20));
      commits = 0;
      act(() => useIssuesStore.setState({ issues: [] }));
      expect(commits).toBe(0);

      openPalette();
      expect(
         (screen.getByPlaceholderText(/Digite um comando ou pesquise/i) as HTMLInputElement).value
      ).toBe('');
   });
});
