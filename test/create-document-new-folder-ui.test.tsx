// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
   Object.defineProperty(Element.prototype, method, { configurable: true, value: () => false });
}

const apiMocks = vi.hoisted(() => ({ createFolder: vi.fn(), createDocument: vi.fn() }));
vi.mock('@/lib/client', async (orig) => ({
   ...(await orig<typeof import('@/lib/client')>()),
   api: { teams: apiMocks },
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));

const { CreateDocumentButton } = await import('@/components/common/teams/create-document-dialog');

beforeEach(() => vi.clearAllMocks());

/** Ad#37 — pasta nova e documento num POST só: a falha do documento não deixa pasta órfã. */
describe('New document em pasta nova (Ad#37)', () => {
   it('manda newFolder no createDocument, sem createFolder separado', async () => {
      apiMocks.createDocument.mockResolvedValue({ id: 'd1' });
      const user = userEvent.setup();
      render(<CreateDocumentButton teamId="CORE" folders={[]} onCreated={() => {}} />);
      await user.click(screen.getByRole('button', { name: /New document/ }));
      await user.click(screen.getByText('Select folder'));
      await user.type(screen.getByPlaceholderText('Folder or new name…'), 'Specs');
      await user.click(await screen.findByText(/Create “Specs”/));
      await user.type(screen.getByPlaceholderText('Document name'), 'RFC');
      await user.click(screen.getByRole('button', { name: 'Create document' }));

      await waitFor(() =>
         expect(apiMocks.createDocument).toHaveBeenCalledWith(
            'CORE',
            expect.objectContaining({ newFolder: { name: 'Specs', icon: '📁' }, name: 'RFC' })
         )
      );
      expect(apiMocks.createFolder).not.toHaveBeenCalled();
   });
});

/** Auditoria (item 14): o botão do ícone só tinha o emoji "📄" para o leitor de tela. */
describe('New document — botão do ícone', () => {
   it('tem nome acessível', async () => {
      const user = userEvent.setup();
      render(<CreateDocumentButton teamId="CORE" folders={[]} onCreated={() => {}} />);
      await user.click(screen.getByRole('button', { name: /New document/ }));
      expect(screen.getByRole('button', { name: 'Choose document icon' })).toBeTruthy();
   });
});
