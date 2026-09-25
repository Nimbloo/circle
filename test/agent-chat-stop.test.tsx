// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentChat from '@/components/common/agent/agent-chat';
import { useAgentChatStore } from '@/store/agent-chat-store';

const apiMocks = vi.hoisted(() => ({ send: vi.fn(), chats: vi.fn(), getChat: vi.fn() }));
vi.mock('@/lib/client', () => ({
   api: { agent: { send: apiMocks.send, chats: apiMocks.chats, getChat: apiMocks.getChat } },
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));
vi.mock('@/components/common/issues/details/content-blocks', () => ({
   InlineText: ({ text }: { text: string }) => <>{text}</>,
}));
Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: () => {} });

/** Simula `fetch` real: a promise só rejeita quando o AbortSignal passado dispara. */
function pendingUntilAborted() {
   apiMocks.send.mockImplementation(
      (_chatId: string | null, _content: string, opts?: { signal?: AbortSignal }) =>
         new Promise((_resolve, reject) => {
            opts?.signal?.addEventListener('abort', () => {
               reject(new DOMException('The user aborted a request.', 'AbortError'));
            });
         })
   );
}

/**
 * "Parar resposta": o botão de enviar vira "Parar" (Square) enquanto a resposta está em
 * voo, Esc faz o mesmo, e o `AbortController` do cliente aborta o fetch. Ao abortar, a
 * bolha vira "Resposta interrompida." — sem estilo de erro, sem "Tentar de novo" (não é
 * uma falha) — e o chatId permanece o mesmo pro próximo envio.
 */
describe('AgentChat — parar resposta em voo', () => {
   beforeEach(() => {
      apiMocks.chats.mockReturnValue(new Promise(() => {}));
      apiMocks.send.mockReset();
      useAgentChatStore.setState({ chats: [], activeChatId: null });
   });

   it('botão "Parar" aborta o fetch e mostra "Resposta interrompida."', async () => {
      pendingUntilAborted();
      render(<AgentChat />);
      const textarea = screen.getByPlaceholderText('Ask the agent…');
      fireEvent.change(textarea, { target: { value: 'Oi' } });
      await act(async () => {
         fireEvent.keyDown(textarea, { key: 'Enter' });
      });

      const stopButton = screen.getByRole('button', { name: 'Parar' });
      await act(async () => {
         fireEvent.click(stopButton);
      });

      const message = useAgentChatStore.getState().chats[0].messages.at(-1)!;
      expect(message.content).toBe('Resposta interrompida.');
      expect(message.streaming).toBeFalsy();
      expect(message.error).toBeFalsy();
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();

      // Sinal realmente abortado (não só a UI local).
      const [, , opts] = apiMocks.send.mock.calls[0];
      expect((opts as { signal?: AbortSignal }).signal?.aborted).toBe(true);
   });

   it('Esc também para a resposta em voo', async () => {
      pendingUntilAborted();
      render(<AgentChat />);
      const textarea = screen.getByPlaceholderText('Ask the agent…');
      fireEvent.change(textarea, { target: { value: 'Oi' } });
      await act(async () => {
         fireEvent.keyDown(textarea, { key: 'Enter' });
      });

      await act(async () => {
         fireEvent.keyDown(window, { key: 'Escape' });
      });

      const message = useAgentChatStore.getState().chats[0].messages.at(-1)!;
      expect(message.content).toBe('Resposta interrompida.');
      expect(message.streaming).toBeFalsy();
   });

   it('num chat já existente, o próximo envio depois de parar usa o MESMO chatId (não duplica)', async () => {
      pendingUntilAborted();
      useAgentChatStore.setState({
         activeChatId: 'srv-1',
         chats: [
            {
               id: 'srv-1',
               title: 'Chat',
               persisted: true,
               loadState: 'ready',
               messages: [{ id: 'u0', role: 'user', content: 'primeira' }],
            },
         ],
      });
      render(<AgentChat />);
      const textarea = () => screen.getByPlaceholderText('Ask the agent…');
      fireEvent.change(textarea(), { target: { value: 'Oi' } });
      await act(async () => {
         fireEvent.keyDown(textarea(), { key: 'Enter' });
      });
      expect(apiMocks.send).toHaveBeenLastCalledWith('srv-1', 'Oi', expect.anything());

      await act(async () => {
         fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
      });

      apiMocks.send.mockReset();
      apiMocks.send.mockResolvedValueOnce({ chatId: 'srv-1', title: 'Chat', reply: 'Olá!' });
      fireEvent.change(textarea(), { target: { value: 'segue' } });
      await act(async () => {
         fireEvent.keyDown(textarea(), { key: 'Enter' });
      });

      expect(apiMocks.send).toHaveBeenLastCalledWith('srv-1', 'segue', expect.anything());
   });
});
