import { describe, it, expect, afterEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { useAgentChatStore } from '@/store/agent-chat-store';

/**
 * O id do chat novo dobra como `clientChatId` (o servidor só aceita UUID). Sem
 * `crypto.randomUUID` (contexto não seguro, browser antigo) o fallback era `chat-N`: o
 * envio omitia o `clientChatId`, e um "Parar" no 1º envio fazia o próximo criar um 2º chat.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

afterEach(() => {
   vi.unstubAllGlobals();
   useAgentChatStore.setState({ chats: [], activeChatId: null });
});

describe('agent-chat-store: id de chat novo', () => {
   it('sem crypto.randomUUID, o fallback ainda é um UUID v4 aceito como clientChatId', () => {
      // Contexto não seguro: `getRandomValues` existe, `randomUUID` não.
      vi.stubGlobal('crypto', {
         getRandomValues: (a: Uint8Array) => webcrypto.getRandomValues(a),
      });
      useAgentChatStore.setState({ chats: [], activeChatId: null });
      const { chatId } = useAgentChatStore.getState().sendMessage('oi');
      expect(chatId).toMatch(UUID_RE);
   });

   it('sem Web Crypto nenhum, o fallback também é UUID v4', () => {
      vi.stubGlobal('crypto', undefined);
      useAgentChatStore.setState({ chats: [], activeChatId: null });
      const a = useAgentChatStore.getState().sendMessage('um').chatId;
      useAgentChatStore.setState({ activeChatId: null });
      const b = useAgentChatStore.getState().sendMessage('dois').chatId;
      expect(a).toMatch(UUID_RE);
      expect(b).toMatch(UUID_RE);
      expect(a).not.toBe(b);
   });
});
