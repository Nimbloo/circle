// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import type { ProjectDetailDto } from '@/lib/api/project-detail';
import { blocksToDoc } from '@/lib/editor-doc';
import { ProjectDetailProvider } from '@/components/common/projects/details/use-project-detail';
import ProjectOverview from '@/components/common/projects/details/project-overview';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makeProject } from './helpers/project-fixture';

/**
 * Outline da descrição do projeto: os ids `doc-h-N` dos headings vêm do próprio
 * ProseMirror (decoration), não de `el.id` gravado no DOM por fora — digitar não
 * recria os nós dos headings e o salto do outline acha o alvo.
 */
const detail = vi.hoisted(() => vi.fn());
vi.mock('@/lib/client', () => ({
   ApiError: class ApiError extends Error {},
   api: {
      projects: { detail, updateDetail: vi.fn(async () => ({ descriptionVersion: 'v2' })) },
      projectSnapshots: { list: vi.fn(async () => []) },
      projectDependencies: { list: vi.fn(async () => []) },
   },
}));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/project/p1/overview',
   useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('nuqs', async (importOriginal) => ({
   ...(await importOriginal<typeof import('nuqs')>()),
   useQueryState: () => [null, vi.fn()],
   useQueryStates: () => [{}, vi.fn()],
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const DOC = blocksToDoc([
   { type: 'heading', text: 'Contexto', level: 1 },
   { type: 'paragraph', text: 'um' },
   { type: 'heading', text: 'Plano', level: 2 },
   { type: 'paragraph', text: 'dois' },
   { type: 'heading', text: 'Riscos', level: 2 },
   { type: 'paragraph', text: 'três' },
]);

const dto = (): ProjectDetailDto => ({
   projectId: 'p1',
   summary: '',
   description: [],
   descriptionDoc: DOC,
   milestones: [],
   resources: [],
   updates: [],
   activity: [],
   descriptionVersion: 'v1',
});

beforeEach(() => {
   detail.mockReset();
   useWorkspaceStore.setState({
      projects: [makeProject({ id: 'p1', name: 'Apollo' })],
      loaded: true,
   });
});

describe('outline da descrição do projeto', () => {
   it('digitar não recria os headings; ids estáveis e o salto acha o alvo', async () => {
      detail.mockResolvedValue(dto());
      const { container } = render(
         <ProjectDetailProvider projectId="p1">
            <ProjectOverview projectId="p1" />
         </ProjectDetailProvider>
      );
      await waitFor(() => expect(container.querySelector('.ProseMirror h2')).not.toBeNull());
      const root = container.querySelector('.ProseMirror') as HTMLElement & { editor?: Editor };
      await waitFor(() => expect(root.querySelector('#doc-h-2')).not.toBeNull());
      const before = Array.from(root.querySelectorAll('h1, h2'));
      expect(before.map((h) => h.id)).toEqual(['doc-h-0', 'doc-h-1', 'doc-h-2']);

      const editor = root.editor!;
      for (const ch of 'abc') {
         act(() => {
            editor.chain().focus('end').insertContent(ch).run();
         });
         // o observer do ProseMirror roda em microtask/timeout
         await act(async () => {
            await new Promise((r) => setTimeout(r, 10));
         });
      }

      const after = Array.from(root.querySelectorAll('h1, h2'));
      expect(after).toHaveLength(3);
      after.forEach((h, i) => expect(h).toBe(before[i]));
      expect(after.map((h) => h.id)).toEqual(['doc-h-0', 'doc-h-1', 'doc-h-2']);

      const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
      fireEvent.click(screen.getAllByRole('button', { name: 'Riscos' })[0]);
      expect(scroll).toHaveBeenCalled();
      expect(scroll.mock.contexts.at(-1)).toBe(after[2]);
      scroll.mockRestore();
   });
});
