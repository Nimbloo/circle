// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ send: vi.fn(), chats: vi.fn(), getChat: vi.fn() }));
const { ApiError } = vi.hoisted(() => {
   class ApiError extends Error {
      constructor(
         public readonly status: number,
         message: string
      ) {
         super(message);
         this.name = 'ApiError';
      }
   }
   return { ApiError };
});
vi.mock('@/lib/client', () => ({
   ApiError,
   api: { agent: { send: apiMocks.send, chats: apiMocks.chats, getChat: apiMocks.getChat } },
}));
const reviewApi = vi.hoisted(() => ({ fetchReview: vi.fn() }));
vi.mock('@/lib/adapters-reviews', () => ({
   fetchReview: (...a: unknown[]) => reviewApi.fetchReview(...a),
   addReviewComment: vi.fn(),
   markReviewViewed: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/common/issues/details/content-blocks', () => ({
   InlineText: ({ text }: { text: string }) => <>{text}</>,
}));
Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: () => {} });

import AgentChat from '@/components/common/agent/agent-chat';
import { ReviewDetail } from '@/components/common/reviews/review-detail';
import { useAgentChatStore } from '@/store/agent-chat-store';

/** co#11/#12 — a mensagem de erro diz o que aconteceu (provedor fora ≠ rede ≠ 404). */
beforeEach(() => {
   vi.clearAllMocks();
   useAgentChatStore.setState({ chats: [], activeChatId: null });
   apiMocks.chats.mockResolvedValue([]);
});

async function ask(text: string) {
   render(<AgentChat />);
   const input = await screen.findByPlaceholderText(/./);
   fireEvent.change(input, { target: { value: text } });
   fireEvent.keyDown(input, { key: 'Enter' });
}

describe('agent — falha do provedor (co#12)', () => {
   it('503 do provedor não culpa a conexão', async () => {
      apiMocks.send.mockRejectedValue(new ApiError(503, 'Provedor indisponível'));
      await ask('oi');
      const message = await screen.findByText(/Agent está indisponível/i);
      expect(message).toBeTruthy();
      expect(screen.queryByText(/Verifique a conexão/i)).toBeNull();
   });

   it('falha de rede continua falando de conexão', async () => {
      apiMocks.send.mockRejectedValue(new TypeError('Failed to fetch'));
      await ask('oi');
      expect(await screen.findByText(/Verifique a conexão/i)).toBeTruthy();
   });
});

describe('review — falha de carga (co#11)', () => {
   it('erro de rede mostra erro com retry, não "Review not found"', async () => {
      reviewApi.fetchReview.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      render(<ReviewDetail reviewId="r1" section="overview" listTab="for-you" />);
      expect(await screen.findByText(/Could not load the review/i)).toBeTruthy();
      expect(screen.queryByText('Review not found')).toBeNull();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
   });

   it('404 continua dizendo que o review não existe', async () => {
      reviewApi.fetchReview.mockRejectedValueOnce(new ApiError(404, 'não encontrado'));
      render(<ReviewDetail reviewId="r1" section="overview" listTab="for-you" />);
      expect(await screen.findByText('Review not found')).toBeTruthy();
   });
});
