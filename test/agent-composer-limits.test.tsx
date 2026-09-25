// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentChat from '@/components/common/agent/agent-chat';
import { useAgentChatStore } from '@/store/agent-chat-store';
import { AGENT_MESSAGE_MAX_LENGTH } from '@/lib/agent-limits';

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
 * O composer não tinha `maxLength`: colar um texto maior que o teto da API (8000,
 * `agent/chats/route.ts`) parecia enviar normalmente e só falhava depois, com um erro
 * genérico — igual ao comentário de issue já resolve com `COMMENT_MAX_LENGTH`
 * (`comment-composer.tsx`).
 */
describe('AgentChat — limite de tamanho do composer', () => {
   beforeEach(() => {
      apiMocks.chats.mockReturnValue(new Promise(() => {}));
      useAgentChatStore.setState({ chats: [], activeChatId: null });
   });

   it('textarea do hero tem maxLength alinhado ao teto da API', () => {
      render(<AgentChat />);
      const textarea = screen.getByPlaceholderText('Ask the agent…') as HTMLTextAreaElement;
      expect(textarea.maxLength).toBe(AGENT_MESSAGE_MAX_LENGTH);
   });

   it('textarea da conversa ativa também tem o mesmo maxLength', () => {
      useAgentChatStore.setState({
         activeChatId: 'c1',
         chats: [
            {
               id: 'c1',
               title: 'Chat',
               persisted: true,
               loadState: 'ready',
               messages: [{ id: 'm1', role: 'user', content: 'oi' }],
            },
         ],
      });
      render(<AgentChat />);
      const textarea = screen.getByPlaceholderText('Ask the agent…') as HTMLTextAreaElement;
      expect(textarea.maxLength).toBe(AGENT_MESSAGE_MAX_LENGTH);
   });
});
