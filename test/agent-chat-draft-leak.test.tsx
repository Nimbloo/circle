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

/**
 * O composer da conversa não trocava de instância ao mudar de chat (mesmo nó JSX, sem
 * `key`): um rascunho não enviado no chat A sobrevivia à troca pro chat B e podia ser
 * mandado pro chat errado.
 */
describe('AgentChat — rascunho não vaza entre chats ao trocar', () => {
   beforeEach(() => {
      apiMocks.chats.mockReturnValue(new Promise(() => {}));
      useAgentChatStore.setState({
         activeChatId: 'c1',
         chats: [
            {
               id: 'c1',
               title: 'Chat A',
               persisted: true,
               loadState: 'ready',
               messages: [{ id: 'a-u1', role: 'user', content: 'oi' }],
            },
            {
               id: 'c2',
               title: 'Chat B',
               persisted: true,
               loadState: 'ready',
               messages: [{ id: 'b-u1', role: 'user', content: 'olá' }],
            },
         ],
      });
   });

   it('trocar de chat sem enviar limpa o texto digitado', () => {
      render(<AgentChat />);
      const textarea = () => screen.getByPlaceholderText('Ask the agent…') as HTMLTextAreaElement;

      fireEvent.change(textarea(), { target: { value: 'rascunho do chat A' } });
      expect(textarea().value).toBe('rascunho do chat A');

      act(() => useAgentChatStore.getState().setActiveChat('c2'));

      expect(textarea().value).toBe('');
   });
});
