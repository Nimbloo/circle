// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentChat from '@/components/common/agent/agent-chat';
import { useAgentChatStore } from '@/store/agent-chat-store';

const apiMocks = vi.hoisted(() => ({ send: vi.fn(), chats: vi.fn(), getChat: vi.fn() }));
vi.mock('@/lib/client', () => ({
   api: { agent: { send: apiMocks.send, chats: apiMocks.chats, getChat: apiMocks.getChat } },
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));

// Sonda de render por linha de texto das mensagens.
const inlineRenders: string[] = [];
vi.mock('@/components/common/issues/details/content-blocks', () => ({
   InlineText: ({ text }: { text: string }) => {
      inlineRenders.push(text);
      return <>{text}</>;
   },
}));

// jsdom não implementa scroll em elementos.
Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: () => {} });

/**
 * Fr#2 (agent): o chat assinava o store inteiro e re-renderizava TODAS as mensagens a
 * cada palavra transmitida (setInterval de 14 ms → um `set` por palavra).
 */
describe('AgentChat — render durante o streaming', () => {
   beforeEach(() => {
      inlineRenders.length = 0;
      // Carga da lista/do chat fica pendente: o estado do teste é o do store semeado.
      apiMocks.chats.mockReturnValue(new Promise(() => {}));
      apiMocks.getChat.mockReturnValue(new Promise(() => {}));
      useAgentChatStore.setState({
         activeChatId: 'c1',
         chats: [
            {
               id: 'c1',
               title: 'Chat',
               messages: [
                  { id: 'm1', role: 'user', content: 'Pergunta antiga' },
                  { id: 'm2', role: 'assistant', content: 'Resposta antiga' },
                  { id: 'm3', role: 'assistant', content: '', streaming: true },
               ],
            },
         ],
      });
   });
   afterEach(() => vi.useRealTimers());

   it('chegada de texto na mensagem em streaming não re-renderiza as anteriores', () => {
      render(<AgentChat />);
      inlineRenders.length = 0;

      act(() => useAgentChatStore.getState().appendToMessage('c1', 'm3', 'Nova'));
      act(() => useAgentChatStore.getState().appendToMessage('c1', 'm3', ' palavra'));

      expect(screen.getByText('Nova palavra')).toBeTruthy();
      expect(inlineRenders).not.toContain('Resposta antiga');
   });

   it('a resposta é transmitida em lote por frame (menos updates que palavras)', async () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'setInterval', 'performance'] });
      const reply = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ');
      apiMocks.send.mockResolvedValue({ chatId: 'c1', title: 'Chat', reply });
      useAgentChatStore.setState({
         chats: [{ id: 'c1', title: 'Chat', messages: [] }],
         activeChatId: 'c1',
      });
      render(<AgentChat />);

      const textarea = screen.getByPlaceholderText('Ask the agent…');
      fireEvent.change(textarea, { target: { value: 'Oi' } });

      let updates = 0;
      const unsubscribe = useAgentChatStore.subscribe(() => updates++);
      await act(async () => {
         fireEvent.keyDown(textarea, { key: 'Enter' });
      });
      await act(async () => {
         await vi.advanceTimersByTimeAsync(5000);
      });
      unsubscribe();

      const last = useAgentChatStore.getState().chats[0].messages.at(-1)!;
      expect(last.content).toBe(reply);
      expect(last.streaming).toBe(false);
      // Antes: um `set` por pedaço (60 palavras + 59 espaços = 119). Em lote: ≤ 1 por frame.
      expect(updates).toBeLessThanOrEqual(70);
   });
});
