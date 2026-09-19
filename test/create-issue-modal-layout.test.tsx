// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateNewIssue } from '@/components/layout/sidebar/create-new-issue';
import { seedCatalog } from './helpers/catalog-fixture';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useIssuesStore } from '@/store/issues-store';

/**
 * is#4: o modal crescia para fora da tela com descrição longa (centralizado por
 * translate-y sem altura máxima). is#5: título só com espaços criava issue em branco.
 * is#6: criar a partir de uma issue de outro time caía no 1º time; sem seletor de time.
 */

const createMock = vi.hoisted(() => vi.fn());
const params = vi.hoisted(() => ({ value: { orgId: 'nimbloo' } as Record<string, string> }));
vi.mock('@/lib/client', () => ({
   api: { teams: { templates: vi.fn(async () => []) }, issues: { create: createMock } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => params.value,
   usePathname: () => '/nimbloo',
}));
vi.mock('@/components/common/editor/block-editor', () => ({
   BlockEditor: () => <div data-testid="block-editor" />,
}));
for (const name of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
   if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { configurable: true, value: () => false });
   }
}

const titleInput = () => screen.getByPlaceholderText('Título da issue') as HTMLInputElement;

function team(id: string, name: string) {
   return {
      id,
      name,
      icon: '',
      joined: true,
      color: '#5e6ad2',
      estimateScale: 'fibonacci',
      cycleCooldownDays: 0,
      autoCloseParent: false,
      autoCloseChildren: false,
      parentId: null,
      members: [],
   };
}

beforeEach(() => {
   vi.clearAllMocks();
   seedCatalog();
   params.value = { orgId: 'nimbloo' };
   createMock.mockImplementation(() => new Promise(() => {}));
   act(() => useCreateIssueStore.setState({ isOpen: false, defaultDrop: null }));
   useWorkspaceStore.setState({
      teams: [team('ENG', 'Engineering'), team('OPS', 'Operations')] as never,
      users: [],
      projects: [],
      me: null,
   });
   useIssuesStore.setState({ issues: [] });
});

describe('modal de criar issue: layout (is#4)', () => {
   it('ancora no topo com altura máxima; só o corpo rola e o rodapé fica visível', () => {
      render(<CreateNewIssue />);
      act(() => useCreateIssueStore.getState().openModal());
      const dialog = screen.getByRole('dialog');
      expect(dialog.className).toMatch(/max-h-/);
      expect(dialog.className).toMatch(/translate-y-0/);
      const body = dialog.querySelector('[data-slot="create-issue-body"]') as HTMLElement;
      expect(body.className).toMatch(/overflow-y-auto/);
      expect(body.className).toMatch(/min-h-0/);
   });
});

describe('modal de criar issue: título (is#5)', () => {
   it('só espaços não cria (botão desabilitado e ⌘Enter ignorado)', async () => {
      const user = userEvent.setup();
      render(<CreateNewIssue />);
      act(() => useCreateIssueStore.getState().openModal());
      await user.type(titleInput(), '    ');
      expect(
         (screen.getByRole('button', { name: /Criar issue/ }) as HTMLButtonElement).disabled
      ).toBe(true);
      fireEvent.keyDown(titleInput(), { key: 'Enter', ctrlKey: true });
      expect(createMock).not.toHaveBeenCalled();
   });

   it('envia o título sem espaços nas pontas e limita o tamanho a 512', async () => {
      const user = userEvent.setup();
      render(<CreateNewIssue />);
      act(() => useCreateIssueStore.getState().openModal());
      expect(titleInput().maxLength).toBe(512);
      await user.type(titleInput(), '  Título  ');
      fireEvent.keyDown(titleInput(), { key: 'Enter', ctrlKey: true });
      await waitFor(() => expect(createMock).toHaveBeenCalled());
      expect(createMock.mock.calls[0][0].title).toBe('Título');
   });
});

describe('modal de criar issue: time (is#6)', () => {
   it('aberto na página de uma issue de outro time, cria nesse time', async () => {
      params.value = { orgId: 'nimbloo', issueId: 'OPS-3' };
      useIssuesStore.setState({
         issues: [{ id: 'i-ops', identifier: 'OPS-3', teamId: 'OPS', title: 'x' }] as never,
      });
      const user = userEvent.setup();
      render(<CreateNewIssue />);
      act(() => useCreateIssueStore.getState().openModal());
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByRole('button', { name: /Team: Operations/ })).toBeTruthy();
      await user.type(titleInput(), 'Nova');
      fireEvent.keyDown(titleInput(), { key: 'Enter', ctrlKey: true });
      await waitFor(() => expect(createMock).toHaveBeenCalled());
      expect(createMock.mock.calls[0][0].teamId).toBe('OPS');
   });

   it('o seletor troca o time da issue', async () => {
      const user = userEvent.setup();
      render(<CreateNewIssue />);
      act(() => useCreateIssueStore.getState().openModal());
      await user.click(screen.getByRole('button', { name: /Team: Engineering/ }));
      await user.click(await screen.findByRole('menuitemradio', { name: /Operations/ }));
      expect(screen.getByRole('button', { name: /Team: Operations/ })).toBeTruthy();
      await user.type(titleInput(), 'Nova');
      fireEvent.keyDown(titleInput(), { key: 'Enter', ctrlKey: true });
      await waitFor(() => expect(createMock).toHaveBeenCalled());
      expect(createMock.mock.calls[0][0].teamId).toBe('OPS');
   });
});
