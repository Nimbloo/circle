// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubIssueCreate } from '@/components/common/issues/details/sub-issue-create';
import { useIssuesStore } from '@/store/issues-store';

const apiMocks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('@/lib/client', () => ({
   api: { issues: { create: apiMocks.create } },
}));

vi.mock('sonner', () => ({
   toast: { success: vi.fn(), error: vi.fn() },
}));

describe('SubIssueCreate (#95)', () => {
   beforeEach(() => {
      apiMocks.create.mockReset();
      apiMocks.create.mockImplementation(async (input: { title: string }) => ({
         id: `id-${input.title}`,
         identifier: `CORE-${input.title}`,
      }));
      // applyRemote busca a issue criada via api.issues.get — não existe no mock; neutraliza.
      useIssuesStore.setState({ applyRemote: async () => {} });
   });

   it('Enter cria com parentId, limpa o input e mantém o foco para a próxima', async () => {
      const user = userEvent.setup();
      const onCreated = vi.fn();
      render(<SubIssueCreate parentId="parent-1" onCreated={onCreated} />);

      await user.click(screen.getByRole('button', { name: /create sub-issue/i }));
      const input = screen.getByRole('textbox', { name: 'Sub-issue title' });
      expect(document.activeElement).toBe(input);

      await user.type(input, 'Primeira{Enter}');

      await waitFor(() => expect(apiMocks.create).toHaveBeenCalledTimes(1));
      expect(apiMocks.create).toHaveBeenCalledWith({ parentId: 'parent-1', title: 'Primeira' });
      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      // Fluxo contínuo: o input segue aberto, vazio e focado.
      const again = screen.getByRole('textbox', { name: 'Sub-issue title' });
      expect((again as HTMLInputElement).value).toBe('');
      await waitFor(() => expect(document.activeElement).toBe(again));

      await user.type(again, 'Segunda{Enter}');
      await waitFor(() => expect(apiMocks.create).toHaveBeenCalledTimes(2));
      expect(apiMocks.create).toHaveBeenLastCalledWith({ parentId: 'parent-1', title: 'Segunda' });
   });

   it('colar 3 linhas cria 3 sub-issues, na ordem; Esc fecha o input', async () => {
      const user = userEvent.setup();
      const onCreated = vi.fn();
      render(<SubIssueCreate parentId="parent-1" onCreated={onCreated} />);

      await user.click(screen.getByRole('button', { name: /create sub-issue/i }));
      const input = screen.getByRole('textbox', { name: 'Sub-issue title' });
      await user.click(input);
      await user.paste('Um\nDois\n\nTrês\n');

      await waitFor(() => expect(apiMocks.create).toHaveBeenCalledTimes(3));
      expect(apiMocks.create.mock.calls.map((c) => c[0].title)).toEqual(['Um', 'Dois', 'Três']);
      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('textbox', { name: 'Sub-issue title' })).toBeNull();
      expect(screen.getByRole('button', { name: /create sub-issue/i })).toBeTruthy();
   });

   it('não cria com título vazio', async () => {
      const user = userEvent.setup();
      render(<SubIssueCreate parentId="parent-1" onCreated={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: /create sub-issue/i }));
      await user.keyboard('{Enter}');
      expect(apiMocks.create).not.toHaveBeenCalled();
   });
});
