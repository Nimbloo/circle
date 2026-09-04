// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TriageSuggestionDto } from '@/lib/api/triage';
import { useCatalogStore } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { labels } from '@/data/labels';

// O Select do Radix usa Pointer Capture, que o jsdom não implementa.
for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
   Object.defineProperty(Element.prototype, method, { configurable: true, value: () => false });
}

const apiMocks = vi.hoisted(() => ({
   suggestion: vi.fn(),
   accept: vi.fn(),
   dismiss: vi.fn(),
   queue: vi.fn(),
}));
vi.mock('@/lib/client', () => ({
   api: {
      triage: {
         suggestion: apiMocks.suggestion,
         accept: apiMocks.accept,
         dismiss: apiMocks.dismiss,
         queue: apiMocks.queue,
      },
   },
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo', teamId: 'ENG' }) }));

import { TriageSuggestionCard } from '@/components/common/issues/triage/triage-suggestion-card';

const AI_SUGGESTION: TriageSuggestionDto = {
   issueId: 'i1',
   source: 'ai',
   teamId: 'ENG',
   priorityId: 'high',
   labelIds: ['bug'],
   duplicates: [
      { issueId: 'i2', identifier: 'ENG-7', title: 'Login quebrado', reason: 'mesmo sintoma' },
   ],
   summary: 'Usuário não consegue autenticar.',
   createdAt: '2026-01-01T00:00:00.000Z',
   appliedAt: null,
   dismissedAt: null,
};

const HEURISTIC_SUGGESTION: TriageSuggestionDto = {
   ...AI_SUGGESTION,
   source: 'heuristic',
   teamId: null,
   priorityId: null,
   labelIds: [],
   summary: '',
};

function seedStores() {
   useCatalogStore.setState({ statuses: status, priorities, labels });
   useWorkspaceStore.setState({
      teams: [
         { id: 'ENG', name: 'Engineering' },
         { id: 'DESIGN', name: 'Design' },
      ] as never,
      users: [],
   });
}

beforeEach(() => {
   vi.clearAllMocks();
   seedStores();
});

describe('card Suggested da triagem (#94)', () => {
   it('mostra time, prioridade, labels, resumo e duplicatas da sugestão da IA', async () => {
      apiMocks.suggestion.mockResolvedValue(AI_SUGGESTION);
      render(<TriageSuggestionCard issueId="i1" />);

      await screen.findByText('Suggested');
      expect(screen.getByText('Usuário não consegue autenticar.')).toBeTruthy();
      expect(screen.getByText('Engineering')).toBeTruthy();
      expect(screen.getByText('High')).toBeTruthy();
      expect(screen.getByText('Bug')).toBeTruthy();
      expect(screen.getByText('ENG-7')).toBeTruthy();
      expect(screen.getByText('· mesmo sintoma')).toBeTruthy();
      // Sem IA a mensagem honesta não aparece aqui.
      expect(screen.queryByText(/AI triage unavailable/)).toBeNull();
   });

   it('Accept chama a API e só então mostra o toast de sucesso', async () => {
      const user = userEvent.setup();
      apiMocks.suggestion.mockResolvedValue(AI_SUGGESTION);
      apiMocks.accept.mockResolvedValue({ ...AI_SUGGESTION, appliedAt: '2026-01-02T00:00:00Z' });
      const onResolved = vi.fn();
      render(<TriageSuggestionCard issueId="i1" onResolved={onResolved} />);
      await screen.findByText('Suggested');

      await user.click(screen.getByRole('button', { name: 'Accept' }));

      await waitFor(() => expect(apiMocks.accept).toHaveBeenCalledWith('i1', {}));
      await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('Suggestion applied'));
      expect(onResolved).toHaveBeenCalled();
      // O card sai da tela depois de aplicado.
      await waitFor(() => expect(screen.queryByText('Suggested')).toBeNull());
   });

   it('falha no Accept faz rollback (card volta) e avisa com toast de erro', async () => {
      const user = userEvent.setup();
      apiMocks.suggestion.mockResolvedValue(AI_SUGGESTION);
      apiMocks.accept.mockRejectedValue(new Error('Sugestão já aplicada'));
      render(<TriageSuggestionCard issueId="i1" />);
      await screen.findByText('Suggested');

      await user.click(screen.getByRole('button', { name: 'Accept' }));

      await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('Sugestão já aplicada'));
      expect(toastMocks.success).not.toHaveBeenCalled();
      expect(screen.getByText('Suggested')).toBeTruthy();
   });

   it('Edit abre os seletores pré-preenchidos e o Accept envia os overrides', async () => {
      const user = userEvent.setup();
      apiMocks.suggestion.mockResolvedValue(AI_SUGGESTION);
      apiMocks.accept.mockResolvedValue({ ...AI_SUGGESTION, appliedAt: '2026-01-02T00:00:00Z' });
      render(<TriageSuggestionCard issueId="i1" />);
      await screen.findByText('Suggested');

      await user.click(screen.getByRole('button', { name: 'Edit' }));
      // Pré-preenchidos com o que a IA sugeriu.
      expect(screen.getByLabelText('Team').textContent).toContain('Engineering');
      expect(screen.getByLabelText('Priority').textContent).toContain('High');
      expect(screen.getByRole('button', { name: 'Bug', pressed: true })).toBeTruthy();

      // Usuário desmarca a label e a duplicata antes de aceitar.
      await user.click(screen.getByRole('button', { name: 'Bug', pressed: true }));
      await user.click(screen.getByLabelText('Link ENG-7'));
      await user.click(screen.getByRole('button', { name: 'Accept' }));

      await waitFor(() =>
         expect(apiMocks.accept).toHaveBeenCalledWith('i1', {
            teamId: 'ENG',
            priorityId: 'high',
            labelIds: [],
            duplicateIds: [],
         })
      );
   });

   it('sem IA mostra a mensagem honesta e só as duplicatas', async () => {
      apiMocks.suggestion.mockResolvedValue(HEURISTIC_SUGGESTION);
      render(<TriageSuggestionCard issueId="i1" />);

      await screen.findByText('AI triage unavailable — showing duplicates only');
      expect(screen.getByText('ENG-7')).toBeTruthy();
      // Sem classificação: nada de Team/Priority/Labels nem do botão Edit.
      expect(screen.queryByText('Team')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
   });

   it('não renderiza nada quando o fallback não achou duplicata, nem quando já foi tratada', async () => {
      apiMocks.suggestion.mockResolvedValue({ ...HEURISTIC_SUGGESTION, duplicates: [] });
      const { unmount } = render(<TriageSuggestionCard issueId="i1" />);
      await waitFor(() => expect(apiMocks.suggestion).toHaveBeenCalled());
      expect(screen.queryByText('Suggested')).toBeNull();
      unmount();

      apiMocks.suggestion.mockResolvedValue({
         ...AI_SUGGESTION,
         dismissedAt: '2026-01-02T00:00:00Z',
      });
      render(<TriageSuggestionCard issueId="i1" />);
      await waitFor(() => expect(apiMocks.suggestion).toHaveBeenCalledTimes(2));
      expect(screen.queryByText('Suggested')).toBeNull();
   });

   it('Dismiss some com o card sem toast de sucesso', async () => {
      const user = userEvent.setup();
      apiMocks.suggestion.mockResolvedValue(AI_SUGGESTION);
      apiMocks.dismiss.mockResolvedValue({
         ...AI_SUGGESTION,
         dismissedAt: '2026-01-02T00:00:00Z',
      });
      render(<TriageSuggestionCard issueId="i1" />);
      await screen.findByText('Suggested');

      await user.click(screen.getByRole('button', { name: 'Dismiss' }));

      await waitFor(() => expect(apiMocks.dismiss).toHaveBeenCalledWith('i1'));
      await waitFor(() => expect(screen.queryByText('Suggested')).toBeNull());
      expect(toastMocks.success).not.toHaveBeenCalled();
   });

   it('a sugestão já carregada pela fila não custa um GET a mais', async () => {
      render(<TriageSuggestionCard issueId="i1" initial={AI_SUGGESTION} />);
      await screen.findByText('Suggested');
      expect(apiMocks.suggestion).not.toHaveBeenCalled();
   });
});
