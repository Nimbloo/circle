// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '@/store/workspace-store';

vi.mock('@/components/common/editor/block-editor', () => ({ BlockEditor: () => null }));
vi.mock('@/lib/client', () => ({
   api: { teams: { projectTemplates: vi.fn(async () => []) } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/projects',
   useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { CreateProjectButton } from '@/components/common/projects/create-project-dialog';

beforeEach(() => {
   useWorkspaceStore.setState({ teams: [], users: [], initiatives: [] });
});

describe('Create project — chips de propriedade (Pl#20)', () => {
   it('chips são botões focáveis que abrem o popover', async () => {
      render(<CreateProjectButton />);
      fireEvent.click(screen.getByRole('button', { name: /Create project/ }));

      const lead = await screen.findByRole('button', { name: /Lead/ });
      expect(lead.tagName).toBe('BUTTON');
      expect(lead.getAttribute('aria-haspopup')).toBe('dialog');
      lead.focus();
      expect(document.activeElement).toBe(lead);

      fireEvent.click(lead);
      expect(lead.getAttribute('aria-expanded')).toBe('true');
   });
});
