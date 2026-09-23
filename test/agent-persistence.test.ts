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
import { __setTestDb } from '@/db';
import { agentChat, agentMessage } from '@/db/schema';
import { getOrCreateUser } from '@/lib/api/users';
import { getAgentChat, listAgentChats, sendAgentMessage } from '@/lib/api/agent';
import { POST as sendChat } from '@/app/api/v1/agent/chats/route';
import { GET as getChat } from '@/app/api/v1/agent/chats/[id]/route';

/**
 * #50 — falha do Bedrock gravava a mensagem do usuário sem resposta; o próximo envio
 * mandava dois turnos `user` seguidos e o Bedrock recusava (chat quebrado para sempre).
 *
 * A mensagem do usuário é gravada ANTES de chamar o provedor; na falha, a resposta
 * também é gravada (role=assistant, error=true) em vez de sumir — o chat sobrevive ao
 * reload e a UI pode oferecer "Tentar de novo". O histórico enviado ao modelo ignora
 * respostas de erro (não são conversa real); os turnos `user` que ficam adjacentes por
 * causa disso são fundidos por `normalizeHistory` — mesma defesa do #50, agora aplicada
 * também aqui. Histórico legado com turnos repetidos é fundido e tem teto.
 */
const ME = 'dev@nimbloo.ai';
const reply = (text: string) => ({
   stopReason: 'end_turn',
   output: { message: { role: 'assistant', content: [{ text }] } },
});

type Sent = { messages: { role: string; content: { text?: string }[] }[] };
const sentMessages = (call: number) => (sendMock.mock.calls[call][0].input as Sent).messages;

beforeEach(() => sendMock.mockReset());

describe('agent: persistência robusta a falha do Bedrock (#50)', () => {
   it('falha no 1º envio cria o chat e grava o par user/assistant(error)', async () => {
      const db = await makeTestDb();
      sendMock.mockRejectedValueOnce(new Error('ThrottlingException'));
      await expect(sendAgentMessage(db, ME, null, 'oi')).rejects.toMatchObject({ status: 503 });

      const chats = await listAgentChats(db, ME);
      expect(chats).toHaveLength(1);
      const msgs = await db.select().from(agentMessage);
      expect(msgs).toHaveLength(2);
      expect(msgs.map((m) => [m.role, m.error])).toEqual([
         ['user', false],
         ['assistant', true],
      ]);
      expect(msgs[0].content).toBe('oi');

      const chat = await getAgentChat(db, ME, chats[0].id);
      expect(chat?.messages).toEqual([
         { role: 'user', content: 'oi' },
         { role: 'assistant', content: expect.any(String), error: true },
      ]);
   });

   it('rota avisa indisponibilidade do provedor com 503 mas persiste o turno (não some no reload)', async () => {
      const db = await makeTestDb();
      __setTestDb(db);
      sendMock.mockRejectedValueOnce(new Error('ThrottlingException'));

      const res = await sendChat(
         new Request('http://x/api/v1/agent/chats', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-forwarded-email': ME },
            body: JSON.stringify({ content: 'oi' }),
         })
      );

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.detail).toContain('provedor do Agent');
      // O chat já foi gravado: o cliente precisa do id para o retry não criar outro.
      const chats = await listAgentChats(db, ME);
      expect(chats).toHaveLength(1);
      expect(body).toMatchObject({ chatId: chats[0].id, title: 'oi' });
      expect(await db.select().from(agentMessage)).toHaveLength(2);
   });

   it('falha num chat existente não deixa turno user órfão; o reenvio funciona', async () => {
      const db = await makeTestDb();
      sendMock.mockResolvedValueOnce(reply('olá'));
      const { chatId } = await sendAgentMessage(db, ME, null, 'oi');

      sendMock.mockRejectedValueOnce(new Error('ThrottlingException'));
      await expect(sendAgentMessage(db, ME, chatId, 'e aí?')).rejects.toThrow();
      const failed = (await getAgentChat(db, ME, chatId))?.messages;
      expect(failed).toHaveLength(4);
      expect(failed?.at(-1)).toMatchObject({ role: 'assistant', error: true });

      sendMock.mockResolvedValueOnce(reply('tudo certo'));
      await sendAgentMessage(db, ME, chatId, 'e aí?');
      // A resposta de erro já persistida não vai ao modelo — só os turnos reais, com
      // os dois `user` adjacentes (o que falhou + o reenvio) fundidos em um.
      const roles = sentMessages(2).map((m) => m.role);
      expect(roles).toEqual(['user', 'assistant', 'user']);
      expect((await getAgentChat(db, ME, chatId))?.messages.map((m) => m.role)).toEqual([
         'user',
         'assistant',
         'user',
         'assistant',
         'user',
         'assistant',
      ]);
   });

   it('pela rota: mensagem com erro sobrevive ao "reload" (GET /agent/chats/{id})', async () => {
      const db = await makeTestDb();
      __setTestDb(db);
      sendMock.mockRejectedValueOnce(new Error('ThrottlingException'));

      const sendRes = await sendChat(
         new Request('http://x/api/v1/agent/chats', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-forwarded-email': ME },
            body: JSON.stringify({ content: 'oi, tudo bem?' }),
         })
      );
      expect(sendRes.status).toBe(503);

      const [chat] = await listAgentChats(db, ME);
      expect(chat).toBeDefined();

      // "Reload": GET pela rota, como a UI faria ao reabrir o chat.
      const getRes = await getChat(
         new Request(`http://x/api/v1/agent/chats/${chat.id}`, {
            headers: { 'x-forwarded-email': ME },
         }),
         { params: Promise.resolve({ id: chat.id }) }
      );
      expect(getRes.status).toBe(200);
      const body = await getRes.json();
      expect(body.data.messages).toEqual([
         { role: 'user', content: 'oi, tudo bem?' },
         { role: 'assistant', content: expect.any(String), error: true },
      ]);
   });

   it('histórico legado com turnos user seguidos é fundido antes de ir ao modelo', async () => {
      const db = await makeTestDb();
      const me = await getOrCreateUser(db, ME);
      const chatId = randomUUID();
      const now = Date.now();
      await db.insert(agentChat).values({
         id: chatId,
         userId: me.id,
         title: 'x',
         createdAt: new Date(),
         updatedAt: new Date(),
      });
      for (const [i, [role, content]] of [
         ['user', 'a'],
         ['user', 'b'],
      ].entries()) {
         await db.insert(agentMessage).values({
            id: randomUUID(),
            chatId,
            role,
            content,
            createdAt: new Date(now + i),
         });
      }
      sendMock.mockResolvedValueOnce(reply('ok'));
      await sendAgentMessage(db, ME, chatId, 'c');
      const msgs = sentMessages(0);
      expect(msgs.map((m) => m.role)).toEqual(['user']);
      expect(msgs[0].content.map((c) => c.text).join('\n')).toContain('a');
      expect(msgs[0].content.map((c) => c.text).join('\n')).toContain('c');
   });

   it('histórico enviado ao modelo tem teto e começa por user', async () => {
      const db = await makeTestDb();
      const me = await getOrCreateUser(db, ME);
      const chatId = randomUUID();
      await db.insert(agentChat).values({
         id: chatId,
         userId: me.id,
         title: 'x',
         createdAt: new Date(),
         updatedAt: new Date(),
      });
      const base = Date.now();
      await db.insert(agentMessage).values(
         Array.from({ length: 200 }, (_, i) => ({
            id: randomUUID(),
            chatId,
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `m${i}`,
            createdAt: new Date(base + i),
         }))
      );
      sendMock.mockResolvedValueOnce(reply('ok'));
      await sendAgentMessage(db, ME, chatId, 'última');
      const msgs = sentMessages(0);
      expect(msgs.length).toBeLessThanOrEqual(41);
      expect(msgs[0].role).toBe('user');
      expect(msgs.at(-1)?.content[0].text).toBe('última');
   });
});
