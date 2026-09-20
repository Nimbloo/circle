// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
   Object.defineProperty(Element.prototype, method, { configurable: true, value: () => false });
}
vi.mock('next/navigation', () => ({ useParams: () => ({ teamId: 'CORE' }) }));
const apiMocks = vi.hoisted(() => ({ documents: vi.fn(), remove: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/client', () => ({
   api: {
      teams: { documents: apiMocks.documents },
      documents: { remove: apiMocks.remove, update: apiMocks.update },
   },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: TeamDocuments } = await import('@/components/common/teams/team-documents');

beforeEach(() => {
   vi.clearAllMocks();
   apiMocks.documents.mockResolvedValue([
      {
         id: 'f1',
         teamId: 'CORE',
         name: 'Specs',
         icon: null,
         documents: [
            {
               id: 'd1',
               folderId: 'f1',
               name: 'RFC',
               icon: null,
               pinned: false,
               creator: { id: 'u', slug: 'u', name: 'Ana', email: 'a@x', avatarUrl: null },
               createdAt: '2026-09-01T00:00:00Z',
               updatedAt: '2026-09-01T00:00:00Z',
            },
         ],
      },
   ]);
   apiMocks.remove.mockResolvedValue({ deleted: true });
});

describe('excluir documento pede confirmação (Ad#21–40)', () => {
   it('Delete abre a confirmação; só o Excluir chama a API', async () => {
      const user = userEvent.setup();
      render(<TeamDocuments />);
      await user.click(await screen.findByRole('button', { name: 'Document actions for RFC' }));
      await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));
      await screen.findByText('Excluir “RFC”?');
      expect(apiMocks.remove).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Excluir' }));
      await waitFor(() => expect(apiMocks.remove).toHaveBeenCalledWith('d1'));
   });
});
