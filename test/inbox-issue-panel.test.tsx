// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IssuePreview from '@/components/common/inbox/issue-preview';
import {
   DetailPanelContainer,
   DetailPanelToggle,
   DetailSidePanel,
   DetailSidePanelTrigger,
} from '@/components/common/detail-side-panel';
import type { InboxItem } from '@/data/inbox';
import { status } from '@/data/status';
import { DEFAULT_DETAIL_PANELS, useDetailPanelStore } from '@/store/detail-panel-store';
import { useIssuesStore } from '@/store/issues-store';

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
}));

/**
 * O painel de properties da issue dentro do Inbox responde à largura do PANE
 * (`@container` + degraus `@3xl/@5xl/@7xl`), não à do viewport — o pane é
 * redimensionável e bem mais estreito que a janela. O toggle (estado persistido do
 * `detail-panel-store`, o mesmo da página da issue) continua no cabeçalho do pane.
 */

// Só os campos que o cabeçalho do preview lê enquanto a issue não está no store.
const notification = {
   id: 'n1',
   identifier: 'ENG-42',
   status: status[0],
   read: true,
   type: 'comment',
   content: 'mentioned you',
   timestamp: '2h',
   user: { name: 'Ana', avatarUrl: '' },
} as unknown as InboxItem;

describe('painel de issue no Inbox', () => {
   beforeEach(() => {
      useDetailPanelStore.setState({ openByKind: { ...DEFAULT_DETAIL_PANELS } });
      useIssuesStore.setState({ issues: [] });
   });

   it('o pane é um query container e o painel usa os degraus do container', async () => {
      const user = userEvent.setup();
      const { container } = render(<IssuePreview notification={notification} />);

      const pane = container.firstElementChild as HTMLElement;
      expect(pane.className).toContain('@container');

      const aside = screen.getByRole('complementary', { name: 'Issue details' });
      expect(aside.className).toContain('@3xl:flex');
      expect(aside.className).toContain('@5xl:w-80');
      expect(aside.className).toContain('@7xl:w-[400px]');
      // Com espaço na frente: `@3xl:flex` também contém "xl:flex".
      expect(aside.className).not.toContain(' xl:flex');
      expect(aside.className).not.toContain(' w-[400px]');

      // Toggle no cabeçalho do pane, com o degrau do container — e funcional.
      const toggle = screen.getByRole('button', { name: 'Close Issue details' });
      expect(toggle.className).toContain('@3xl:inline-flex');
      expect(toggle.className).not.toContain(' xl:inline-flex');
      await user.click(toggle);
      expect(screen.queryByRole('complementary', { name: 'Issue details' })).toBeNull();
      expect(useDetailPanelStore.getState().openByKind.issue).toBe(false);

      // Trigger do Sheet cobre o vão "viewport xl, pane estreito".
      const trigger = screen.getByRole('button', { name: 'Properties' });
      expect(trigger.className).toContain('@3xl:hidden');
      expect(trigger.className).toContain('xl:@max-3xl:inline-flex');
   });

   it('fora de um container o painel continua respondendo ao viewport (xl)', () => {
      render(
         <>
            <DetailPanelToggle kind="issue" />
            <DetailSidePanelTrigger kind="issue" />
            <DetailSidePanel kind="issue" title="Issue details">
               <p>props</p>
            </DetailSidePanel>
         </>
      );

      expect(screen.getByRole('complementary', { name: 'Issue details' }).className).toContain(
         'w-[400px] xl:flex'
      );
      expect(screen.getByRole('button', { name: 'Close Issue details' }).className).toContain(
         'xl:inline-flex'
      );
      expect(screen.getByRole('button', { name: 'Properties' }).className).toContain('xl:hidden');
   });

   it('o DetailPanelContainer troca os degraus de qualquer painel dentro dele', () => {
      act(() => useDetailPanelStore.getState().setOpen('project', true));
      render(
         <DetailPanelContainer>
            <DetailSidePanel kind="project" title="Project details">
               <p>props</p>
            </DetailSidePanel>
         </DetailPanelContainer>
      );

      const aside = screen.getByRole('complementary', { name: 'Project details' });
      expect(aside.className).toContain('@3xl:flex @3xl:w-64 @5xl:w-80 @7xl:w-[400px]');
      expect(aside.className).not.toContain(' xl:flex');
   });
});
