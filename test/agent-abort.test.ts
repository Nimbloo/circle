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

import { makeTestDb } from './helpers/db';
import { agentMessage } from '@/db/schema';
import { getAgentChat, listAgentChats, sendAgentMessage } from '@/lib/api/agent';

const ME = 'dev@nimbloo.ai';
const reply = (text: string) => ({
   stopReason: 'end_turn',
   output: { message: { role: 'assistant', content: [{ text }] } },
});

beforeEach(() => sendMock.mockReset());

/**
 * "Parar resposta": o cliente aborta o fetch em voo (AbortController). O turno abortado
 * não pode deixar a mensagem do usuário órfã nem duplicar o chat — persiste coerente
 * ("Resposta interrompida.") e devolve o MESMO chatId, sem lançar exceção (não é uma
 * falha, o usuário só pediu pra parar). O sinal é propagado pro SDK do Bedrock.
 */
describe('agent: parar resposta (AbortController)', () => {
   it('sinal abortado durante a chamada ao Bedrock: persiste "Resposta interrompida.", sem órfã nem duplicar', async () => {
      const db = await makeTestDb();
      const controller = new AbortController();
      sendMock.mockImplementationOnce(async () => {
         controller.abort();
         const err = new Error('The operation was aborted');
         err.name = 'AbortError';
         throw err;
      });

      const res = await sendAgentMessage(db, ME, null, 'explique isso', {
         signal: controller.signal,
      });

      expect(res.reply).toContain('interrompid');
      expect(res.chatId).toBeTruthy();

      const chats = await listAgentChats(db, ME);
      expect(chats).toHaveLength(1);
      expect(res.chatId).toBe(chats[0].id);

      const msgs = await db.select().from(agentMessage);
      expect(msgs).toHaveLength(2);
      expect(msgs.map((m) => [m.role, m.error])).toEqual([
         ['user', false],
         ['assistant', false],
      ]);
      expect(msgs[0].content).toBe('explique isso');
   });

   it('propaga o AbortSignal do turno pro send() do SDK do Bedrock', async () => {
      const db = await makeTestDb();
      const controller = new AbortController();
      sendMock.mockResolvedValueOnce(reply('ok'));

      await sendAgentMessage(db, ME, null, 'oi', { signal: controller.signal });

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock.mock.calls[0][1]).toMatchObject({ abortSignal: controller.signal });
   });

   it('próximo envio depois de abortar continua no MESMO chat (chatId preservado)', async () => {
      const db = await makeTestDb();
      const controller1 = new AbortController();
      sendMock.mockImplementationOnce(async () => {
         controller1.abort();
         const err = new Error('aborted');
         err.name = 'AbortError';
         throw err;
      });
      const first = await sendAgentMessage(db, ME, null, 'primeira', {
         signal: controller1.signal,
      });

      sendMock.mockResolvedValueOnce(reply('segunda resposta'));
      const second = await sendAgentMessage(db, ME, first.chatId, 'segunda', {
         signal: new AbortController().signal,
      });

      expect(second.chatId).toBe(first.chatId);
      const chats = await listAgentChats(db, ME);
      expect(chats).toHaveLength(1);
      const chat = await getAgentChat(db, ME, first.chatId);
      expect(chat?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
   });
});
