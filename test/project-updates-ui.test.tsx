// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectActivity from '@/components/common/projects/details/project-activity';
import { blocksToMarkdown } from '@/components/common/projects/update-blocks';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makeProject } from './helpers/project-fixture';
import { seedCatalog } from './helpers/catalog-fixture';

const apiMocks = vi.hoisted(() => ({
   detail: vi.fn(),
   postUpdate: vi.fn(),
   updateUpdate: vi.fn(),
   removeUpdate: vi.fn(),
}));

vi.mock('@/lib/client', () => {
   class ApiError extends Error {}
   return {
      ApiError,
      api: {
         projects: {
            detail: apiMocks.detail,
            postUpdate: apiMocks.postUpdate,
            updateUpdate: apiMocks.updateUpdate,
            removeUpdate: apiMocks.removeUpdate,
         },
         projectDependencies: { list: vi.fn(async () => []) },
         projectSnapshots: { list: vi.fn(async () => []) },
      },
   };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/project/p1/activity',
   useRouter: () => ({ push: vi.fn() }),
}));

const update = {
   id: 'u1',
   author: { id: 'u-ana', slug: 'ana', name: 'Ana', email: 'ana@nimbloo.ai', avatarUrl: null },
   health: 'off-track',
   blocks: [
      { type: 'paragraph', text: 'atrasou' },
      { type: 'bullet-list', items: ['um', 'dois'] },
   ],
   createdAt: '2026-09-10T12:00:00.000Z',
};

beforeEach(() => {
   vi.clearAllMocks();
   seedCatalog();
   apiMocks.detail.mockResolvedValue({
      projectId: 'p1',
      summary: '',
      description: [],
      descriptionDoc: null,
      milestones: [],
      resources: [],
      updates: [update],
      activity: [],
   });
   useWorkspaceStore.setState({
      loaded: true,
      users: [],
      teams: [],
      initiatives: [],
      projects: [makeProject({ id: 'p1', name: 'Alpha' })],
   });
});

describe('editar e excluir update de projeto (pl#11)', () => {
   it('editar preserva listas no composer e grava os blocos', async () => {
      apiMocks.updateUpdate.mockResolvedValue({ ...update, blocks: [] });
      render(<ProjectActivity projectId="p1" />);
      fireEvent.pointerDown(await screen.findByRole('button', { name: 'Update actions' }), {
         button: 0,
         ctrlKey: false,
      });
      fireEvent.click(await screen.findByText('Edit'));

      const editor = (await screen.findByLabelText('Edit update')) as HTMLTextAreaElement;
      expect(editor.value).toBe('atrasou\n\n- um\n- dois');
      fireEvent.change(editor, { target: { value: '- um\n- dois\n- três' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save update' }));

      await waitFor(() => expect(apiMocks.updateUpdate).toHaveBeenCalledTimes(1));
      expect(apiMocks.updateUpdate.mock.calls[0].slice(0, 2)).toEqual(['p1', 'u1']);
      expect(apiMocks.updateUpdate.mock.calls[0][2].blocks).toEqual([
         { type: 'bullet-list', items: ['um', 'dois', 'três'] },
      ]);
   });

   it('update vazio não é salvo', async () => {
      render(<ProjectActivity projectId="p1" />);
      fireEvent.pointerDown(await screen.findByRole('button', { name: 'Update actions' }), {
         button: 0,
         ctrlKey: false,
      });
      fireEvent.click(await screen.findByText('Edit'));
      fireEvent.change(await screen.findByLabelText('Edit update'), { target: { value: '  ' } });
      expect(screen.getByRole('button', { name: 'Save update' })).toHaveProperty('disabled', true);
      expect(apiMocks.updateUpdate).not.toHaveBeenCalled();
   });

   it('excluir pede confirmação antes de chamar a API', async () => {
      apiMocks.removeUpdate.mockResolvedValue({ deleted: true });
      render(<ProjectActivity projectId="p1" />);
      fireEvent.pointerDown(await screen.findByRole('button', { name: 'Update actions' }), {
         button: 0,
         ctrlKey: false,
      });
      fireEvent.click(await screen.findByText('Delete'));
      expect(apiMocks.removeUpdate).not.toHaveBeenCalled();
      fireEvent.click(await screen.findByRole('button', { name: 'Delete update' }));
      await waitFor(() => expect(apiMocks.removeUpdate).toHaveBeenCalledWith('p1', 'u1'));
   });

   it('mobile (390px): nome longo do autor trunca em vez de estourar a linha', async () => {
      apiMocks.detail.mockResolvedValue({
         projectId: 'p1',
         summary: '',
         description: [],
         descriptionDoc: null,
         milestones: [],
         resources: [],
         updates: [
            { ...update, author: { ...update.author, name: 'Christopher Alexander-Montgomery' } },
         ],
         activity: [],
      });
      render(<ProjectActivity projectId="p1" />);
      const author = await screen.findByText('Christopher Alexander-Montgomery');
      const header = author.closest('div')!;
      expect(header.className).toContain('min-w-0');
      expect(author.className).toContain('truncate');
   });
});

describe('blocos ↔ markdown do composer (pl#11)', () => {
   it('preserva listas, heading, citação e código', () => {
      expect(
         blocksToMarkdown([
            { type: 'heading', text: 'Semana', level: 2 },
            { type: 'checklist', items: [{ text: 'a', checked: true }] },
            { type: 'code', language: 'ts', code: 'const a = 1;' },
            { type: 'quote', text: 'ok' },
         ])
      ).toBe('## Semana\n\n- [x] a\n\n```ts\nconst a = 1;\n```\n\n> ok');
   });
});
