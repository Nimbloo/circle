// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
describe('AgentChat — render ao chegar a resposta', () => {
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

   it('resposta que chega não re-renderiza as mensagens anteriores', () => {
      render(<AgentChat />);
      inlineRenders.length = 0;

      act(() => useAgentChatStore.getState().resolveMessage('c1', 'm3', 'Nova palavra'));

      expect(screen.getByText('Nova palavra')).toBeTruthy();
      expect(inlineRenders).not.toContain('Resposta antiga');
   });
});
