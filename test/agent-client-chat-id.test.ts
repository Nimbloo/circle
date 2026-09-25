import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
   BedrockRuntimeClient: class {
      send = sendMock;
   },
   ConverseCommand: class {
      input: unknown;
      constructor(input: unknown) {
         this.input = structuredClone(input);
      }
   },
}));

import { randomUUID } from 'node:crypto';
import { makeTestDb } from './helpers/db';
import { ApiError } from '@/lib/api/errors';
import { getAgentChat, listAgentChats, sendAgentMessage } from '@/lib/api/agent';

const ME = 'dev@nimbloo.ai';
const OTHER = 'outra-pessoa@nimbloo.ai';
const reply = (text: string) => ({
   stopReason: 'end_turn',
   output: { message: { role: 'assistant', content: [{ text }] } },
});

beforeEach(() => sendMock.mockReset());

/**
 * `clientChatId` (aditivo): o id que o CLIENTE já minta ao abrir um chat novo. Fecha o
 * buraco que sobrava depois do "Parar resposta" — abortar a 1ª mensagem de um chat novo
 * nunca devolve o chatId real (o fetch foi cancelado), então o próximo envio não sabia
 * em qual chat continuar e duplicava. Com o id vindo do cliente, o servidor sempre sabe
 * onde gravar, sem depender da resposta ter chegado.
 */
describe('agent: clientChatId (chat novo aberto pelo cliente)', () => {
   it('sem clientChatId, o comportamento atual se mantém (chat novo com id do servidor)', async () => {
      const db = await makeTestDb();
      sendMock.mockResolvedValueOnce(reply('oi!'));
      const res = await sendAgentMessage(db, ME, null, 'oi');
      expect(res.chatId).toBeTruthy();
      const chats = await listAgentChats(db, ME);
      expect(chats).toHaveLength(1);
      expect(chats[0].id).toBe(res.chatId);
   });

   it('clientChatId de um chat que ainda não existe: o servidor cria com esse id', async () => {
      const db = await makeTestDb();
      const clientChatId = randomUUID();
      sendMock.mockResolvedValueOnce(reply('oi!'));
      const res = await sendAgentMessage(db, ME, null, 'oi', { clientChatId });
      expect(res.chatId).toBe(clientChatId);
      const chat = await getAgentChat(db, ME, clientChatId);
      expect(chat?.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
   });

   it('abortar a 1ª mensagem e reenviar com o MESMO clientChatId cai no mesmo chat', async () => {
      const db = await makeTestDb();
      const clientChatId = randomUUID();
      const controller = new AbortController();
      sendMock.mockImplementationOnce(async () => {
         controller.abort();
         const err = new Error('aborted');
         err.name = 'AbortError';
         throw err;
      });

      const first = await sendAgentMessage(db, ME, null, 'primeira', {
         signal: controller.signal,
         clientChatId,
      });
      expect(first.chatId).toBe(clientChatId);
      expect(first.reply).toContain('interrompid');

      sendMock.mockResolvedValueOnce(reply('segunda resposta'));
      const second = await sendAgentMessage(db, ME, null, 'segunda', { clientChatId });
      expect(second.chatId).toBe(clientChatId);

      const chats = await listAgentChats(db, ME);
      expect(chats).toHaveLength(1);
      const chat = await getAgentChat(db, ME, clientChatId);
      expect(chat?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
   });

   it('clientChatId de um chat de OUTRO usuário é recusado (409), sem vazar nada dele', async () => {
      const db = await makeTestDb();
      sendMock.mockResolvedValueOnce(reply('segredo da outra pessoa'));
      const theirs = await sendAgentMessage(db, OTHER, null, 'pergunta confidencial');

      let caught: unknown;
      try {
         await sendAgentMessage(db, ME, null, 'tentando colidir', {
            clientChatId: theirs.chatId,
         });
      } catch (e) {
         caught = e;
      }

      expect(caught).toBeInstanceOf(ApiError);
      expect((caught as ApiError).status).toBe(409);
      expect((caught as Error).message).not.toContain('segredo');
      expect((caught as Error).message).not.toContain('confidencial');
      expect((caught as ApiError).extensions ?? {}).not.toHaveProperty('chatId');

      // Nada foi criado pro ME, e o chat da outra pessoa não foi tocado.
      expect(await listAgentChats(db, ME)).toHaveLength(0);
      const theirChat = await getAgentChat(db, OTHER, theirs.chatId);
      expect(theirChat?.messages).toHaveLength(2);
   });
});
