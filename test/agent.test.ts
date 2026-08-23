import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocka o SDK do Bedrock: o loop de tool-use é exercitado sem rede.
const sendMock = vi.fn();
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
   BedrockRuntimeClient: class {
      send = sendMock;
   },
   ConverseCommand: class {
      input: unknown;
      constructor(input: unknown) {
         this.input = input;
      }
   },
}));

import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { createIssue, listIssues } from '@/lib/api/issues';
import { runAgent } from '@/lib/api/agent';

const ME = 'dev@nimbloo.ai';

beforeEach(() => sendMock.mockReset());

describe('agent (Bedrock tool-use)', () => {
   it('executa a tool read-only contra o db real e devolve o texto final', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const issue = await createIssue(
         db,
         { teamId: 'CORE', title: 'Bug de login', statusId: 'to-do', priorityId: 'high' },
         ME
      );

      sendMock
         .mockResolvedValueOnce({
            stopReason: 'tool_use',
            output: {
               message: {
                  role: 'assistant',
                  content: [
                     { toolUse: { name: 'list_issues', toolUseId: 't1', input: { team: 'CORE' } } },
                  ],
               },
            },
         })
         .mockResolvedValueOnce({
            stopReason: 'end_turn',
            output: {
               message: { role: 'assistant', content: [{ text: 'Há 1 issue: Bug de login.' }] },
            },
         });

      const reply = await runAgent(db, ME, [{ role: 'user', content: 'quais issues no CORE?' }]);

      expect(reply).toBe('Há 1 issue: Bug de login.');
      expect(sendMock).toHaveBeenCalledTimes(2);

      // A 2ª chamada ao modelo carrega o resultado REAL da tool (dados vivos do db).
      const secondInput = sendMock.mock.calls[1][0].input as { messages: unknown };
      const serialized = JSON.stringify(secondInput.messages);
      expect(serialized).toContain('Bug de login');
      expect(serialized).toContain(issue.identifier);
   }, 20000);

   it('devolve a resposta direta quando o modelo não usa ferramentas', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      sendMock.mockResolvedValueOnce({
         stopReason: 'end_turn',
         output: { message: { role: 'assistant', content: [{ text: 'Olá! Como posso ajudar?' }] } },
      });
      const reply = await runAgent(db, ME, [{ role: 'user', content: 'oi' }]);
      expect(reply).toBe('Olá! Como posso ajudar?');
      expect(sendMock).toHaveBeenCalledTimes(1);
   });

   it('propaga erro do Bedrock (ex: AccessDenied) como exceção', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      sendMock.mockRejectedValueOnce(new Error('AccessDeniedException'));
      await expect(runAgent(db, ME, [{ role: 'user', content: 'oi' }])).rejects.toThrow();
   });

   it('tool de escrita create_issue cria a issue de verdade no db', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');

      sendMock
         .mockResolvedValueOnce({
            stopReason: 'tool_use',
            output: {
               message: {
                  role: 'assistant',
                  content: [
                     {
                        toolUse: {
                           name: 'create_issue',
                           toolUseId: 'w1',
                           input: { team: 'CORE', title: 'Corrigir login', priority: 'High' },
                        },
                     },
                  ],
               },
            },
         })
         .mockResolvedValueOnce({
            stopReason: 'end_turn',
            output: { message: { role: 'assistant', content: [{ text: 'Criei CORE-1.' }] } },
         });

      const reply = await runAgent(db, ME, [
         { role: 'user', content: 'crie uma issue "Corrigir login" no CORE com prioridade alta' },
      ]);
      expect(reply).toBe('Criei CORE-1.');

      // A issue foi realmente persistida (com a prioridade resolvida por nome).
      const issues = await listIssues(db, { team: 'CORE' });
      expect(issues).toHaveLength(1);
      expect(issues[0].title).toBe('Corrigir login');
      expect(issues[0].priority?.name).toBe('High');
   });
});
