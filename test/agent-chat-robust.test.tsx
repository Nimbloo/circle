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

/** #50 (cliente) + Co#11: chat robusto a falha, hydrate sem apagar conversa em voo. */
describe('agent chat store (#50)', () => {
   beforeEach(() => {
      apiMocks.send.mockReset();
      apiMocks.chats.mockReset();
      apiMocks.getChat.mockReset();
      useAgentChatStore.setState({ chats: [], activeChatId: null });
   });

   it('hydrate preserva o chat local em voo e as mensagens já carregadas', async () => {
      useAgentChatStore.setState({
         activeChatId: 'chat-local',
         chats: [
            {
               id: 'chat-local',
               title: 'Novo',
               persisted: false,
               messages: [
                  { id: 'u1', role: 'user', content: 'oi' },
                  { id: 'a1', role: 'assistant', content: '', streaming: true },
               ],
            },
            {
               id: 's1',
               title: 'Antigo',
               persisted: true,
               loadState: 'ready',
               messages: [{ id: 's1-0', role: 'user', content: 'x' }],
            },
         ],
      });
      apiMocks.chats.mockResolvedValue([
         { id: 's1', title: 'Antigo', updatedAt: '2026-09-18T00:00:00Z' },
         { id: 's2', title: 'Outro', updatedAt: '2026-09-17T00:00:00Z' },
      ]);
      await useAgentChatStore.getState().hydrate();
      const chats = useAgentChatStore.getState().chats;
      expect(chats.map((c) => c.id)).toEqual(['chat-local', 's1', 's2']);
      expect(chats.find((c) => c.id === 'chat-local')?.messages).toHaveLength(2);
      expect(chats.find((c) => c.id === 's1')?.messages).toHaveLength(1);
   });

   it('falha no 1º envio: o reenvio cria o chat (chatId null), não usa o id local', async () => {
      apiMocks.chats.mockReturnValue(new Promise(() => {}));
      apiMocks.send.mockRejectedValueOnce(new Error('500'));
      render(<AgentChat />);
      const textarea = () => screen.getByPlaceholderText('Ask the agent…');
      fireEvent.change(textarea(), { target: { value: 'Oi' } });
      await act(async () => {
         fireEvent.keyDown(textarea(), { key: 'Enter' });
      });
      expect(apiMocks.send).toHaveBeenLastCalledWith(null, 'Oi');

      apiMocks.send.mockResolvedValueOnce({ chatId: 'srv-1', title: 'Oi', reply: 'Olá!' });
      fireEvent.change(textarea(), { target: { value: 'Oi de novo' } });
      await act(async () => {
         fireEvent.keyDown(textarea(), { key: 'Enter' });
      });
      expect(apiMocks.send).toHaveBeenLastCalledWith(null, 'Oi de novo');
      expect(useAgentChatStore.getState().activeChatId).toBe('srv-1');
   });

   it('resposta revelada de uma vez (sem digitação simulada)', async () => {
      apiMocks.chats.mockReturnValue(new Promise(() => {}));
      const reply = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ');
      apiMocks.send.mockResolvedValue({ chatId: 'srv-1', title: 'Oi', reply });
      render(<AgentChat />);
      const textarea = screen.getByPlaceholderText('Ask the agent…');
      fireEvent.change(textarea, { target: { value: 'Oi' } });
      await act(async () => {
         fireEvent.keyDown(textarea, { key: 'Enter' });
      });
      const last = useAgentChatStore.getState().chats[0].messages.at(-1)!;
      expect(last.content).toBe(reply);
      expect(last.streaming).toBe(false);
   });

   it('abrir chat ainda não carregado mostra estado de carregamento', async () => {
      apiMocks.chats.mockReturnValue(new Promise(() => {}));
      apiMocks.getChat.mockReturnValue(new Promise(() => {}));
      useAgentChatStore.setState({
         activeChatId: 's1',
         chats: [{ id: 's1', title: 'Antigo', persisted: true, messages: [] }],
      });
      render(<AgentChat />);
      expect(await screen.findByText(/Carregando conversa/i)).toBeTruthy();
   });
});
