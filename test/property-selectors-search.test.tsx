// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusSelector } from '@/components/common/issues/status-selector';
import { StatusSelector as CreateStatusSelector } from '@/components/layout/sidebar/create-new-issue/status-selector';
import { PrioritySelector as CreatePrioritySelector } from '@/components/layout/sidebar/create-new-issue/priority-selector';
import { LabelSelector } from '@/components/layout/sidebar/create-new-issue/label-selector';
import { ProjectSelector } from '@/components/layout/sidebar/create-new-issue/project-selector';
import { labels } from '@/data/labels';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { useCatalogStore } from '@/store/catalog-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { makeProject } from './helpers/project-fixture';

vi.mock('@/lib/client', () => ({ api: { issues: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));

/** #31: o cmdk filtrava pelo `value` (id) — status/label/projeto criados com id opaco não
 *  eram achados pelo nome. #32: o seletor de projeto listava projetos de outros times. */
const custom = { ...status[0], id: 'st-9f3a', name: 'Revisão' };
const renamed = { ...labels[0], id: 'lbl-77c1', name: 'Renomeada' };
const urgent = { ...priorities[0], id: 'prio-x1', name: 'Crítica' };
const alpha = { ...makeProject({ id: 'p-51d0', name: 'Alpha' }), teamId: 'ENG' };
const outro = { ...makeProject({ id: 'p-99aa', name: 'Beta' }), teamId: 'DES' };

beforeEach(() => {
   useCatalogStore.setState({
      statuses: [...status, custom],
      labels: [...labels, renamed],
      priorities: [...priorities, urgent],
   });
   useIssuesStore.setState({ issues: [] });
   useWorkspaceStore.setState({ users: [], projects: [alpha, outro], cycles: [] });
});

const search = async (placeholder: string, text: string) => {
   const u = userEvent.setup();
   await u.type(await screen.findByPlaceholderText(placeholder), text);
};

describe('#31 busca por nome nos seletores', () => {
   it('status da linha', async () => {
      render(<StatusSelector status={status[0]} issueId="i1" />);
      await userEvent.setup().click(screen.getByRole('combobox', { name: 'Set status' }));
      await search('Set status...', 'Revis');
      expect(screen.getByRole('option', { name: /Revisão/ })).toBeTruthy();
   });

   it('status do modal de criação', async () => {
      render(<CreateStatusSelector status={status[0]} onChange={() => {}} />);
      await userEvent.setup().click(screen.getByRole('combobox'));
      await search('Set status...', 'Revis');
      expect(screen.getByRole('option', { name: /Revisão/ })).toBeTruthy();
   });

   it('prioridade do modal de criação', async () => {
      render(<CreatePrioritySelector priority={priorities[0]} onChange={() => {}} />);
      await userEvent.setup().click(screen.getByRole('combobox'));
      await search('Set priority...', 'Crít');
      expect(screen.getByRole('option', { name: /Crítica/ })).toBeTruthy();
   });

   it('label renomeada', async () => {
      render(<LabelSelector selectedLabels={[]} onChange={() => {}} />);
      await userEvent.setup().click(screen.getByRole('combobox'));
      await search('Search labels...', 'Renom');
      expect(screen.getByRole('option', { name: /Renomeada/ })).toBeTruthy();
   });

   it('projeto pelo nome', async () => {
      render(<ProjectSelector project={undefined} onChange={() => {}} />);
      await userEvent.setup().click(screen.getByRole('combobox'));
      await search('Set project...', 'Alp');
      expect(screen.getByRole('option', { name: /Alpha/ })).toBeTruthy();
   });
});

describe('#32 seletor de projeto por time', () => {
   it('só lista projetos do time informado', async () => {
      render(<ProjectSelector project={undefined} teamId="ENG" onChange={() => {}} />);
      await userEvent.setup().click(screen.getByRole('combobox'));
      expect(await screen.findByRole('option', { name: /Alpha/ })).toBeTruthy();
      expect(screen.queryByRole('option', { name: /Beta/ })).toBeNull();
   });
});
