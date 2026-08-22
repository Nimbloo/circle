import {
   BedrockRuntimeClient,
   ConverseCommand,
   type ContentBlock,
   type Message,
   type Tool,
   type ToolConfiguration,
} from '@aws-sdk/client-bedrock-runtime';
import type { Db } from '@/db';
import { getOrCreateUser } from './users';
import { listTeams } from './teams';
import { listIssues, type IssueListOptions } from './issues';
import { listCyclesByTeam } from './cycles';

/**
 * Agent do Circle — chat com IA REAL (AWS Bedrock/Claude via IRSA) e contexto
 * do workspace. O modelo consulta os dados vivos (times/issues/ciclos) por
 * ferramentas SOMENTE-LEITURA que reusam a camada lib/api; nunca escreve.
 *
 * Credenciais: default provider chain → Web Identity Token (IRSA) do pod, igual
 * ao SES. Requer `bedrock:InvokeModel` na role e model access habilitado.
 */
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
const MAX_TOOL_ROUNDS = 6;

let _client: BedrockRuntimeClient | null = null;
function client(): BedrockRuntimeClient {
   _client ??= new BedrockRuntimeClient({ region: REGION });
   return _client;
}

export interface AgentChatMessage {
   role: 'user' | 'assistant';
   content: string;
}

const SYSTEM = `Você é o assistente do Circle, uma ferramenta de gestão de projetos estilo Linear da Nimbloo.
Responda SEMPRE em português brasileiro, de forma concisa, direta e útil.
Você tem ferramentas para consultar os dados REAIS do workspace do usuário (times, issues, ciclos).
Use as ferramentas antes de responder qualquer pergunta sobre o backlog — NUNCA invente dados, ids ou números.
Se uma consulta não retornar nada, diga honestamente que não encontrou.
Você é SOMENTE-LEITURA: não pode criar, editar nem apagar nada; se pedirem, explique como fazer na interface.
Ao listar issues, use o identificador (ex: ENG-42) e seja sucinto.`;

const TOOLS: Tool[] = [
   {
      toolSpec: {
         name: 'list_teams',
         description:
            'Lista os times do workspace do usuário, com contagem de membros e projetos, e se o usuário participa.',
         inputSchema: { json: { type: 'object', properties: {} } },
      },
   },
   {
      toolSpec: {
         name: 'list_issues',
         description:
            'Lista issues do workspace, com filtros opcionais. Retorna identificador, título, status, prioridade e responsável.',
         inputSchema: {
            json: {
               type: 'object',
               properties: {
                  team: {
                     type: 'string',
                     description: 'Chave do time (ex: ENG). Omita para todos.',
                  },
                  status: {
                     type: 'string',
                     description: 'Nome exato do status (ex: "In Progress", "Todo", "Done").',
                  },
                  assignee: {
                     type: 'string',
                     description:
                        '"me" para as issues do próprio usuário, ou o nome/e-mail do responsável.',
                  },
                  priority: {
                     type: 'string',
                     description: 'Nome da prioridade (ex: "Urgent", "High").',
                  },
                  query: { type: 'string', description: 'Texto para buscar no título.' },
                  limit: { type: 'number', description: 'Máximo de issues (padrão 50, teto 100).' },
               },
            },
         },
      },
   },
   {
      toolSpec: {
         name: 'list_cycles',
         description: 'Lista os ciclos (sprints) de um time, com datas e progresso.',
         inputSchema: {
            json: {
               type: 'object',
               properties: { team: { type: 'string', description: 'Chave do time (ex: ENG).' } },
               required: ['team'],
            },
         },
      },
   },
];

type ToolInput = Record<string, unknown>;

async function runTool(
   db: Db,
   meId: string,
   email: string,
   name: string,
   input: ToolInput
): Promise<string> {
   try {
      if (name === 'list_teams') {
         const teams = await listTeams(db, {}, meId);
         return JSON.stringify(
            teams.map((t) => ({
               team: t.id, // t.id É a key (ex: ENG)
               name: t.name,
               members: t.memberCount,
               projects: t.projectCount,
               joined: t.joined,
            }))
         );
      }
      if (name === 'list_issues') {
         const opts: IssueListOptions = {
            team: typeof input.team === 'string' ? input.team : undefined,
            limit: Math.min(typeof input.limit === 'number' ? input.limit : 50, 100),
         };
         if (typeof input.status === 'string') opts.status = [input.status];
         if (typeof input.priority === 'string') opts.priority = [input.priority];
         if (typeof input.query === 'string') opts.q = input.query;
         if (input.assignee === 'me') opts.assigneeMe = email;
         else if (typeof input.assignee === 'string') opts.assignee = [input.assignee];
         const issues = await listIssues(db, opts, meId);
         if (issues.length === 0) return '[]';
         return JSON.stringify(
            issues.slice(0, 100).map((i) => ({
               id: i.identifier,
               title: i.title,
               status: i.status?.name ?? null,
               priority: i.priority?.name ?? null,
               assignee: i.assignee?.name ?? null,
            }))
         );
      }
      if (name === 'list_cycles') {
         const teamKey = typeof input.team === 'string' ? input.team : '';
         const teams = await listTeams(db, {}, meId);
         const team = teams.find((t) => t.id === teamKey);
         if (!team) return `Time "${teamKey}" não encontrado.`;
         const cycles = await listCyclesByTeam(db, team.id);
         if (cycles.length === 0) return '[]';
         return JSON.stringify(
            cycles.map((c) => ({
               name: c.name,
               status: c.status,
               start: c.startDate,
               end: c.endDate,
               scope: c.scope,
               completed: c.completed,
            }))
         );
      }
      return `Ferramenta desconhecida: ${name}`;
   } catch (e) {
      return `Erro ao executar ${name}: ${(e as Error).message}`;
   }
}

/**
 * Roda o loop de conversa com tool-use até a resposta final de texto.
 * `history` é o diálogo até agora (a última mensagem deve ser do usuário).
 */
export async function runAgent(
   db: Db,
   email: string,
   history: AgentChatMessage[]
): Promise<string> {
   const me = await getOrCreateUser(db, email);
   const messages: Message[] = history
      .filter((m) => m.content.trim() !== '')
      .map((m) => ({ role: m.role, content: [{ text: m.content }] }));

   const toolConfig: ToolConfiguration = { tools: TOOLS };

   for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await client().send(
         new ConverseCommand({
            modelId: MODEL_ID,
            system: [{ text: SYSTEM }],
            messages,
            toolConfig,
            inferenceConfig: { maxTokens: 1024, temperature: 0.2 },
         })
      );

      const out = res.output?.message;
      if (!out) break;
      messages.push(out);

      if (res.stopReason === 'tool_use') {
         const toolResults: ContentBlock[] = [];
         for (const block of out.content ?? []) {
            const tu = block.toolUse;
            if (!tu?.name || !tu.toolUseId) continue;
            const result = await runTool(db, me.id, email, tu.name, (tu.input ?? {}) as ToolInput);
            toolResults.push({
               toolResult: { toolUseId: tu.toolUseId, content: [{ text: result }] },
            });
         }
         messages.push({ role: 'user', content: toolResults });
         continue;
      }

      const text = (out.content ?? [])
         .map((b) => b.text ?? '')
         .join('')
         .trim();
      return text || '(sem resposta)';
   }
   return 'Não consegui completar a análise — muitas rodadas de ferramentas. Reformule a pergunta, por favor.';
}
