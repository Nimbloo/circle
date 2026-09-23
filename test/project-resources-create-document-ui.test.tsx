// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '@/store/workspace-store';

for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
   Object.defineProperty(Element.prototype, method, { configurable: true, value: () => false });
}

const apiMocks = vi.hoisted(() => ({
   createDocument: vi.fn(),
   addResource: vi.fn(),
   updateResource: vi.fn(),
   removeResource: vi.fn(),
}));
vi.mock('@/lib/client', async (orig) => ({
   ...(await orig<typeof import('@/lib/client')>()),
   api: { projects: apiMocks },
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   useRouter: () => ({ push }),
}));

const { ProjectResources } = await import('@/components/common/projects/details/project-resources');

function seedStore(joined: boolean) {
   useWorkspaceStore.setState({
      projects: [{ id: 'P1', name: 'Checkout', teamId: 'CORE' }],
      teams: [{ id: 'CORE', name: 'Core', joined }],
   } as unknown as Partial<ReturnType<typeof useWorkspaceStore.getState>>);
}

beforeEach(() => vi.clearAllMocks());

describe('Resources → Create document…', () => {
   it('cria o documento, avisa só após a API, recarrega e abre o documento', async () => {
      seedStore(true);
      const url = '/nimbloo/team/CORE/documents/d1';
      apiMocks.createDocument.mockResolvedValue({
         document: { id: 'd1', teamId: 'CORE', url },
         resource: { id: 'r1', label: 'Checkout — doc', url },
      });
      const onChanged = vi.fn();
      const user = userEvent.setup();
      render(<ProjectResources projectId="P1" resources={[]} onChanged={onChanged} />);

      await user.click(screen.getByRole('button', { name: /Add document or link/ }));
      await user.click(await screen.findByRole('menuitem', { name: /Create document/ }));

      await waitFor(() => expect(push).toHaveBeenCalledWith(url));
      expect(apiMocks.createDocument).toHaveBeenCalledWith('P1', { orgId: 'nimbloo' });
      expect(toastMocks.success).toHaveBeenCalledTimes(1);
      expect(onChanged).toHaveBeenCalled();
      expect(toastMocks.error).not.toHaveBeenCalled();
   });

   it('recarregar os resources falhar não impede abrir o documento já criado', async () => {
      seedStore(true);
      const url = '/nimbloo/team/CORE/documents/d1';
      apiMocks.createDocument.mockResolvedValue({
         document: { id: 'd1', teamId: 'CORE', url },
         resource: { id: 'r1', label: 'Checkout — doc', url },
      });
      const onChanged = vi.fn().mockRejectedValue(new Error('rede'));
      const user = userEvent.setup();
      render(<ProjectResources projectId="P1" resources={[]} onChanged={onChanged} />);
      await user.click(screen.getByRole('button', { name: /Add document or link/ }));
      await user.click(await screen.findByRole('menuitem', { name: /Create document/ }));
      await waitFor(() => expect(push).toHaveBeenCalledWith(url));
   });

   it('falha na API: toast de erro, sem sucesso nem navegação', async () => {
      seedStore(true);
      apiMocks.createDocument.mockRejectedValue(new Error('boom'));
      const user = userEvent.setup();
      render(<ProjectResources projectId="P1" resources={[]} onChanged={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /Add document or link/ }));
      await user.click(await screen.findByRole('menuitem', { name: /Create document/ }));

      await waitFor(() => expect(toastMocks.error).toHaveBeenCalledTimes(1));
      expect(toastMocks.success).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
   });

   it('quem não é membro do time do projeto vê o item desabilitado, com o motivo', async () => {
      seedStore(false);
      const user = userEvent.setup();
      render(<ProjectResources projectId="P1" resources={[]} onChanged={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /Add document or link/ }));
      const item = await screen.findByRole('menuitem', { name: /Create document/ });
      expect(item.getAttribute('aria-disabled')).toBe('true');
      await user.hover(item.parentElement!);
      expect(
         (await screen.findAllByText(/Only members of the project’s team/)).length
      ).toBeGreaterThan(0);
      await user.click(item);
      expect(apiMocks.createDocument).not.toHaveBeenCalled();
   });

   it('resource interno (documento) abre na mesma aba, sem target=_blank', () => {
      seedStore(true);
      render(
         <ProjectResources
            projectId="P1"
            resources={[
               { id: 'r1', label: 'Checkout — doc', url: '/nimbloo/team/CORE/documents/d1' },
               { id: 'r2', label: 'example.com', url: 'https://example.com' },
            ]}
            onChanged={vi.fn()}
         />
      );
      const internal = screen.getByRole('link', { name: /Checkout — doc/ });
      expect(internal.getAttribute('href')).toBe('/nimbloo/team/CORE/documents/d1');
      expect(internal.hasAttribute('target')).toBe(false);
      expect(screen.getByRole('link', { name: /example.com/ }).getAttribute('target')).toBe(
         '_blank'
      );
   });
});
