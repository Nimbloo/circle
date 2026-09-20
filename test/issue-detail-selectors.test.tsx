// @vitest-environment jsdom

import './setup-dom';
import React, { Profiler } from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IssueDetails from '@/components/common/issues/details/issue-details';
import IssuePreview from '@/components/common/inbox/issue-preview';
import type { InboxItem } from '@/data/inbox';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from './helpers/catalog-fixture';
import { useIssuesStore } from '@/store/issues-store';

vi.mock('@/lib/client', () => ({
   // Deep-link frio pendente: a página fica no skeleton durante o teste.
   api: { issues: { get: vi.fn(() => new Promise(() => {})) } },
}));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', issueId: 'ENG-42' }),
   usePathname: () => '/nimbloo/issue/ENG-42',
   useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

/**
 * Fr#6: detalhe e preview do inbox assinavam `s.issues` inteiro e procuravam a issue no
 * componente — qualquer evento de OUTRA issue re-renderizava a tela. O seletor agora
 * devolve só a issue (referência estável via `find`).
 */
const other: Issue = {
   id: 'o1',
   identifier: 'ENG-1',
   title: 'Outra',
   description: '',
   status: status[0],
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: 'a',
   teamId: 'ENG',
};

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

function renderCounting(node: React.ReactNode) {
   let commits = 0;
   render(
      <Profiler id="probe" onRender={() => commits++}>
         {node}
      </Profiler>
   );
   return { reset: () => (commits = 0), count: () => commits };
}

const touchOtherIssue = () =>
   act(() => useIssuesStore.setState({ issues: [{ ...other, title: 'Mudou' }] }));

describe('detalhe/preview de issue — seletor estreito', () => {
   beforeEach(() => {
      useIssuesStore.setState({ issues: [other] });
   });

   it('preview do inbox não re-renderiza quando outra issue muda', () => {
      const probe = renderCounting(<IssuePreview notification={notification} />);
      probe.reset();
      touchOtherIssue();
      expect(probe.count()).toBe(0);
   });

   it('página da issue não re-renderiza quando outra issue muda', () => {
      const probe = renderCounting(<IssueDetails />);
      probe.reset();
      touchOtherIssue();
      expect(probe.count()).toBe(0);
   });
});
