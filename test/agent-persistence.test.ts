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
import { agentChat, agentMessage } from '@/db/schema';
import { getOrCreateUser } from '@/lib/api/users';
import { getAgentChat, listAgentChats, sendAgentMessage } from '@/lib/api/agent';

/**
 * #50 — falha do Bedrock gravava a mensagem do usuário sem resposta; o próximo envio
 * mandava dois turnos `user` seguidos e o Bedrock recusava (chat quebrado para sempre).
 * Agora o par user/assistant só é gravado no sucesso, histórico legado com turnos
 * repetidos é fundido e o histórico enviado ao modelo tem teto.
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
   it('falha no 1º envio não cria chat nem grava mensagem', async () => {
      const db = await makeTestDb();
      sendMock.mockRejectedValueOnce(new Error('ThrottlingException'));
      await expect(sendAgentMessage(db, ME, null, 'oi')).rejects.toThrow();
      expect(await listAgentChats(db, ME)).toHaveLength(0);
      expect(await db.select().from(agentMessage)).toHaveLength(0);
   });

   it('falha num chat existente não deixa turno user órfão; o reenvio funciona', async () => {
      const db = await makeTestDb();
      sendMock.mockResolvedValueOnce(reply('olá'));
      const { chatId } = await sendAgentMessage(db, ME, null, 'oi');

      sendMock.mockRejectedValueOnce(new Error('ThrottlingException'));
      await expect(sendAgentMessage(db, ME, chatId, 'e aí?')).rejects.toThrow();
      expect((await getAgentChat(db, ME, chatId))?.messages).toHaveLength(2);

      sendMock.mockResolvedValueOnce(reply('tudo certo'));
      await sendAgentMessage(db, ME, chatId, 'e aí?');
      const roles = sentMessages(2).map((m) => m.role);
      expect(roles).toEqual(['user', 'assistant', 'user']);
      expect((await getAgentChat(db, ME, chatId))?.messages.map((m) => m.role)).toEqual([
         'user',
         'assistant',
         'user',
         'assistant',
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
