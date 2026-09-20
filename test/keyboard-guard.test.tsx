// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardShortcuts } from '@/components/layout/keyboard-shortcuts';
import { useCreateIssueStore } from '@/store/create-issue-store';

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
   useRouter: () => ({ push: vi.fn() }),
}));

/** Co (baixa): atalhos globais ficam inativos com dialog/menu aberto. */
describe('atalhos globais com overlay aberto', () => {
   it('`c` não abre o "criar issue" com um menu aberto', () => {
      const openModal = vi.fn();
      useCreateIssueStore.setState({ openModal } as never);
      render(<KeyboardShortcuts />);
      const menu = document.createElement('div');
      menu.setAttribute('role', 'menu');
      menu.setAttribute('data-state', 'open');
      document.body.appendChild(menu);
      fireEvent.keyDown(window, { key: 'c' });
      expect(openModal).not.toHaveBeenCalled();
      menu.remove();
      fireEvent.keyDown(window, { key: 'c' });
      expect(openModal).toHaveBeenCalledOnce();
   });
});
