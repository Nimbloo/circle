import {
   BedrockRuntimeClient,
   ConverseCommand,
   InvokeModelCommand,
   type ContentBlock,
   type Message,
   type Tool,
   type ToolConfiguration,
} from '@aws-sdk/client-bedrock-runtime';
import { and, asc, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '@/db';
import { issue as issueT, appUser, agentChat, agentMessage } from '@/db/schema';
import { getOrCreateUser } from './users';
import { getUserSettings } from './settings';
import { ApiError } from './errors';
import { listTeams } from './teams';
import { listIssues, createIssue, updateIssue, type IssueListOptions } from './issues';
import { listCyclesByTeam } from './cycles';
import { getCachedCatalogs } from './catalogs';
import { scopeForEmail } from './scope';

/**
 * Agent do Circle — chat com IA REAL (AWS Bedrock/Claude via IRSA) e contexto
 * do workspace. O modelo consulta (times/issues/ciclos) e AGE (criar issue,
 * atualizar status/prioridade/responsável) por ferramentas que reusam lib/api,
 * sempre com o e-mail do usuário como ator. Não apaga nada.
 *
 * Credenciais: default provider chain → Web Identity Token (IRSA) do pod, igual
 * ao SES. Requer `bedrock:InvokeModel` na role e model access habilitado.
 */
const REGION = process.env.AWS_REGION ?? 'us-east-1';
export const MODEL_ID =
   process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
const MAX_TOOL_ROUNDS = 6;
/** Teto de turnos do histórico enviados ao modelo (custo/latência e limite de contexto). */
const MAX_HISTORY_TURNS = 40;

let _client: BedrockRuntimeClient | null = null;
function client(): BedrockRuntimeClient {
   _client ??= new BedrockRuntimeClient({ region: REGION });
   return _client;
}

/**
 * Uma chamada de texto, sem ferramentas nem histórico (mesmo client/modelo do agent).
 * Usado por geradores one-shot (ex.: guia de review). Lança se o Bedrock não responder.
 */
export async function invokeText(
   prompt: string,
   opts: { system?: string; maxTokens?: number } = {}
): Promise<string> {
   const res = await client().send(
      new ConverseCommand({
         modelId: MODEL_ID,
         system: opts.system ? [{ text: opts.system }] : undefined,
         messages: [{ role: 'user', content: [{ text: prompt }] }],
         inferenceConfig: { maxTokens: opts.maxTokens ?? 4096, temperature: 0.2 },
      })
   );
   return (res.output?.message?.content ?? [])
      .map((b) => b.text ?? '')
      .join('')
      .trim();
}

export interface AgentChatMessage {
   role: 'user' | 'assistant';
   content: string;
   /** A resposta falhou (persistida mesmo assim — ver `sendAgentMessage`). */
   error?: boolean;
}

const SYSTEM = `Você é o assistente do Circle, uma ferramenta de gestão de projetos estilo Linear da Nimbloo.
Responda SEMPRE em português brasileiro, de forma concisa, direta e útil.
Você tem ferramentas para CONSULTAR (times, issues, ciclos) e para AGIR (criar issue, atualizar status/prioridade/responsável de uma issue).
Use as ferramentas de leitura antes de responder perguntas sobre o backlog — NUNCA invente dados, ids ou números.
Se uma consulta não retornar nada, diga honestamente que não encontrou.
Para AGIR: só execute uma ação de escrita quando o pedido do usuário for CLARO e inequívoco. Se for ambíguo
(qual issue? qual time? qual status?), pergunte antes em vez de adivinhar. Após agir, confirme o que foi feito
citando o identificador (ex: "Criei ENG-42" / "Movi ENG-42 para In Progress"). Você NÃO apaga nada.
Ao listar ou referenciar issues, use sempre o identificador (ex: ENG-42) e seja sucinto.`;

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
   {
      toolSpec: {
         name: 'create_issue',
         description:
            'Cria uma nova issue num time. Use só quando o usuário pedir explicitamente para criar. Retorna o identificador (ex: ENG-42).',
         inputSchema: {
            json: {
               type: 'object',
               properties: {
                  team: { type: 'string', description: 'Chave do time (ex: ENG).' },
                  title: { type: 'string', description: 'Título da issue.' },
                  description: { type: 'string', description: 'Descrição (opcional).' },
                  status: {
                     type: 'string',
                     description: 'Nome do status (opcional; padrão Todo).',
                  },
                  priority: {
                     type: 'string',
                     description: 'Nome da prioridade (opcional; padrão No priority).',
                  },
               },
               required: ['team', 'title'],
            },
         },
      },
   },
   {
      toolSpec: {
         name: 'update_issue',
         description:
            'Atualiza uma issue existente (status, prioridade ou responsável). Identifique a issue pelo identificador (ex: ENG-42).',
         inputSchema: {
            json: {
               type: 'object',
               properties: {
                  issue: { type: 'string', description: 'Identificador da issue (ex: ENG-42).' },
                  status: { type: 'string', description: 'Novo status (nome, ex: "In Progress").' },
                  priority: { type: 'string', description: 'Nova prioridade (nome, ex: "High").' },
                  assignee: {
                     type: 'string',
                     description: '"me" para atribuir a si mesmo, ou o e-mail do responsável.',
                  },
               },
               required: ['issue'],
            },
         },
      },
   },
];

type ToolInput = Record<string, unknown>;

class AgentProviderError extends Error {
   constructor(cause: unknown) {
      super('O provedor do Agent está indisponível', { cause });
      this.name = 'AgentProviderError';
   }
}

/** "Parar resposta": o usuário abortou o turno (não é falha do provedor nem do app). */
class AgentAbortedError extends Error {
   constructor(cause: unknown) {
      super('Resposta interrompida pelo usuário', { cause });
      this.name = 'AgentAbortedError';
   }
}

/** Resolve id de catálogo (status/priority) por nome, case-insensitive. */
function findByName(rows: { id: string; name: string }[], name: string): string | undefined {
   const n = name.trim().toLowerCase();
   return rows.find((r) => r.name.toLowerCase() === n)?.id;
}

async function runTool(
   db: Db,
   meId: string,
   email: string,
   name: string,
   input: ToolInput
): Promise<string> {
   try {
      // O agente responde COMO o usuário: as ferramentas herdam o escopo dele (#100),
      // senão um convidado leria o workspace inteiro pela conversa.
      const { teamIds } = await scopeForEmail(db, email);
      const scoped = teamIds ?? undefined;
      if (name === 'list_teams') {
         const teams = await listTeams(db, { teamIds: scoped }, meId);
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
         if (scoped) opts.teamIds = scoped;
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
         const teams = await listTeams(db, { teamIds: scoped }, meId);
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
      if (name === 'create_issue') {
         const team = typeof input.team === 'string' ? input.team : '';
         const title = typeof input.title === 'string' ? input.title.trim() : '';
         if (!team || !title) return 'Erro: "team" e "title" são obrigatórios.';
         const cat = await getCachedCatalogs(db);
         const statusId =
            (typeof input.status === 'string' && findByName(cat.statuses, input.status)) || 'to-do';
         const priorityId =
            (typeof input.priority === 'string' && findByName(cat.priorities, input.priority)) ||
            'no-priority';
         const created = await createIssue(
            db,
            {
               teamId: team,
               title,
               statusId,
               priorityId,
               description: typeof input.description === 'string' ? input.description : null,
            },
            email
         );
         return JSON.stringify({
            created: created.identifier,
            title: created.title,
            status: created.status?.name ?? null,
            priority: created.priority?.name ?? null,
         });
      }
      if (name === 'update_issue') {
         const ident = typeof input.issue === 'string' ? input.issue.trim() : '';
         if (!ident) return 'Erro: informe o identificador da issue (ex: ENG-42).';
         const [row] = await db
            .select({ id: issueT.id })
            .from(issueT)
            .where(eq(issueT.identifier, ident))
            .limit(1);
         if (!row) return `Issue "${ident}" não encontrada.`;
         const cat = await getCachedCatalogs(db);
         const patch: Record<string, unknown> = {};
         if (typeof input.status === 'string') {
            const sid = findByName(cat.statuses, input.status);
            if (!sid) return `Status "${input.status}" não existe.`;
            patch.statusId = sid;
         }
         if (typeof input.priority === 'string') {
            const pid = findByName(cat.priorities, input.priority);
            if (!pid) return `Prioridade "${input.priority}" não existe.`;
            patch.priorityId = pid;
         }
         if (input.assignee === 'me') {
            patch.assigneeId = meId;
         } else if (typeof input.assignee === 'string') {
            const [u] = await db
               .select({ id: appUser.id })
               .from(appUser)
               .where(eq(appUser.email, input.assignee.trim().toLowerCase()))
               .limit(1);
            if (!u) return `Usuário "${input.assignee}" não encontrado.`;
            patch.assigneeId = u.id;
         }
         if (Object.keys(patch).length === 0) {
            return 'Nada para atualizar — informe status, priority ou assignee.';
         }
         const updated = await updateIssue(db, row.id, patch, email);
         return JSON.stringify({
            updated: ident,
            status: updated?.status?.name ?? null,
            priority: updated?.priority?.name ?? null,
            assignee: updated?.assignee?.name ?? null,
         });
      }
      return `Ferramenta desconhecida: ${name}`;
   } catch (e) {
      return `Erro ao executar ${name}: ${(e as Error).message}`;
   }
}

/**
 * Histórico aceito pelo Bedrock: sem vazios, turnos alternados (turnos seguidos do mesmo
 * papel — ex.: legado de uma falha antiga — são fundidos), com teto e começando por `user`.
 */
function normalizeHistory(history: AgentChatMessage[]): AgentChatMessage[] {
   const merged: AgentChatMessage[] = [];
   for (const m of history) {
      if (m.content.trim() === '') continue;
      const last = merged.at(-1);
      if (last && last.role === m.role)
         last.content = `${last.content}

${m.content}`;
      else merged.push({ role: m.role, content: m.content });
   }
   const capped = merged.slice(-MAX_HISTORY_TURNS);
   while (capped.length && capped[0].role !== 'user') capped.shift();
   return capped;
}

/** Ferramentas que alteram dados (as demais só leem). */
const WRITE_TOOLS = new Set(['create_issue', 'update_issue']);

/**
 * Roda o loop de conversa com tool-use até a resposta final de texto.
 * `history` é o diálogo até agora (a última mensagem deve ser do usuário).
 */
export async function runAgent(
   db: Db,
   email: string,
   history: AgentChatMessage[],
   opts: { signal?: AbortSignal } = {}
): Promise<string> {
   const me = await getOrCreateUser(db, email);
   const messages: Message[] = normalizeHistory(history).map((m) => ({
      role: m.role,
      content: [{ text: m.content }],
   }));

   // Personalização do agente (settings/agent-personalization): a guidance do usuário
   // é anexada ao system prompt. Antes era persistida mas nunca lida — inerte.
   const settings = await getUserSettings(db, me.id);
   const prefs = (settings.preferences ?? {}) as { agentGuidance?: unknown };
   const guidance = typeof prefs.agentGuidance === 'string' ? prefs.agentGuidance.trim() : '';
   const systemText = guidance
      ? `${SYSTEM}\n\n--- Instruções personalizadas do usuário (respeite-as, sem violar as regras acima) ---\n${guidance}`
      : SYSTEM;

   const toolConfig: ToolConfiguration = { tools: TOOLS };
   // Escritas já feitas neste turno. Se o provedor cair depois delas, o turno NÃO pode
   // virar erro com "Tentar de novo": reenviar a pergunta repetiria a escrita.
   const writes: string[] = [];

   for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await (async () => {
         try {
            return await client().send(
               new ConverseCommand({
                  modelId: MODEL_ID,
                  system: [{ text: systemText }],
                  messages,
                  toolConfig,
                  inferenceConfig: { maxTokens: 1024, temperature: 0.2 },
               }),
               // Propaga o "Parar" do cliente pro SDK do Bedrock (corta a chamada de rede
               // em voo); se o handler não honrar o abort, a promise só resolve/rejeita
               // normalmente mais tarde — sem efeito colateral, o resultado é descartado.
               { abortSignal: opts.signal }
            );
         } catch (e) {
            if (opts.signal?.aborted) throw new AgentAbortedError(e);
            if (writes.length === 0) throw new AgentProviderError(e);
            return null;
         }
      })();
      if (!res)
         return (
            `Já fiz isto antes de o provedor do Agent falhar:\n${writes.map((w) => `- ${w}`).join('\n')}\n\n` +
            'Não consegui terminar a resposta. Confira o resultado antes de pedir de novo.'
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
            // Sucesso das ferramentas de escrita é JSON; recusa/erro é texto.
            if (WRITE_TOOLS.has(tu.name) && result.startsWith('{'))
               writes.push(`${tu.name}: ${result}`);
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

// ── Persistência de conversas do agente (#23) ────────────────────────────
export interface AgentChatSummary {
   id: string;
   title: string;
   updatedAt: string;
}

/** Chats do usuário (mais recentes primeiro). */
export async function listAgentChats(db: Db, email: string): Promise<AgentChatSummary[]> {
   const me = await getOrCreateUser(db, email);
   const rows = await db
      .select({ id: agentChat.id, title: agentChat.title, updatedAt: agentChat.updatedAt })
      .from(agentChat)
      .where(eq(agentChat.userId, me.id))
      .orderBy(desc(agentChat.updatedAt));
   return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() }));
}

/** Mensagens de um chat (valida dono). `error`: a resposta do assistente falhou (o
 * turno ficou salvo mesmo assim — não some no reload; a UI oferece "Tentar de novo"). */
export async function getAgentChat(
   db: Db,
   email: string,
   chatId: string
): Promise<{ id: string; title: string; messages: AgentChatMessage[] } | null> {
   const me = await getOrCreateUser(db, email);
   const [chat] = await db
      .select()
      .from(agentChat)
      .where(and(eq(agentChat.id, chatId), eq(agentChat.userId, me.id)))
      .limit(1);
   if (!chat) return null;
   const msgs = await db
      .select({ role: agentMessage.role, content: agentMessage.content, error: agentMessage.error })
      .from(agentMessage)
      .where(eq(agentMessage.chatId, chatId))
      .orderBy(asc(agentMessage.createdAt));
   return {
      id: chat.id,
      title: chat.title,
      messages: msgs.map((m) => ({
         role: m.role as 'user' | 'assistant',
         content: m.content,
         error: m.error || undefined,
      })),
   };
}

/**
 * Envia uma mensagem: grava o turno do usuário ANTES de chamar o provedor — se o
 * Bedrock falhar, o turno não some (a UI mostra a mensagem com erro e permite
 * reenviar, em vez de o par inteiro desaparecer no reload). O histórico enviado ao
 * modelo ignora respostas de erro já persistidas (não são conversa real);
 * `normalizeHistory` funde os turnos `user` que ficam adjacentes por causa disso —
 * mesma defesa que evitava dois `user` seguidos no Bedrock (#50).
 */
export async function sendAgentMessage(
   db: Db,
   email: string,
   chatId: string | null,
   content: string,
   opts: { signal?: AbortSignal } = {}
): Promise<{ chatId: string; title: string; reply: string }> {
   const me = await getOrCreateUser(db, email);
   let title = '';
   let history: AgentChatMessage[] = [];
   if (chatId) {
      const chat = await getAgentChat(db, email, chatId);
      if (!chat) throw new ApiError(404, 'Chat não encontrado');
      title = chat.title;
      history = chat.messages.filter((m) => !m.error);
   }
   const isNew = !chatId;
   const chatKey = chatId ?? randomUUID();
   if (isNew) title = content.trim().slice(0, 80) || 'New chat';

   const userAt = new Date();
   await db.transaction(async (tx) => {
      if (isNew) {
         await tx
            .insert(agentChat)
            .values({ id: chatKey, userId: me.id, title, createdAt: userAt, updatedAt: userAt });
      } else {
         await tx.update(agentChat).set({ updatedAt: userAt }).where(eq(agentChat.id, chatKey));
      }
      await tx
         .insert(agentMessage)
         .values({ id: randomUUID(), chatId: chatKey, role: 'user', content, createdAt: userAt });
   });

   let reply: string;
   try {
      reply = await runAgent(db, email, [...history, { role: 'user', content }], {
         signal: opts.signal,
      });
   } catch (e) {
      if (e instanceof AgentAbortedError) {
         // "Parar resposta": não é falha do provedor nem do app — o usuário pediu pra
         // parar. Cai no MESMO caminho de sucesso abaixo (grava um turno coerente, sem
         // `error`, com o MESMO chatId), então não duplica nem deixa a pergunta órfã.
         reply = 'Resposta interrompida.';
      } else {
         const isProviderError = e instanceof AgentProviderError;
         const errorText = isProviderError
            ? 'O provedor do Agent está indisponível. Tente de novo.'
            : 'O Agent falhou ao responder. Tente de novo.';
         const failedAt = new Date(userAt.getTime() + 1);
         await db.transaction(async (tx) => {
            await tx.insert(agentMessage).values({
               id: randomUUID(),
               chatId: chatKey,
               role: 'assistant',
               content: errorText,
               error: true,
               createdAt: failedAt,
            });
            await tx.update(agentChat).set({ updatedAt: failedAt }).where(eq(agentChat.id, chatKey));
         });
         // O chat já está gravado ANTES desta exceção: o cliente precisa do id de volta
         // pra o retry não criar um chat duplicado. Vale para QUALQUER falha aqui, não só
         // a do provedor (503) — um `throw e` cru perdia esse vínculo em erros genéricos
         // (ex.: blip de DB), deixando o chat já persistido órfão até o próximo hydrate.
         throw new ApiError(isProviderError ? 503 : 500, errorText, { chatId: chatKey, title });
      }
   }

   const now = new Date(userAt.getTime() + 1);
   await db.transaction(async (tx) => {
      await tx.insert(agentMessage).values({
         id: randomUUID(),
         chatId: chatKey,
         role: 'assistant',
         content: reply,
         createdAt: now,
      });
      await tx.update(agentChat).set({ updatedAt: now }).where(eq(agentChat.id, chatKey));
   });
   return { chatId: chatKey, title, reply };
}

// ─────────────────────────────────────────────────────────────
// Embeddings (busca semântica opcional — #99)
// ─────────────────────────────────────────────────────────────

/** Modelo de embedding (Titan v2). Mesma região/credenciais do agent (IRSA). */
export const EMBED_MODEL_ID = process.env.BEDROCK_EMBED_MODEL_ID ?? 'amazon.titan-embed-text-v2:0';
const EMBED_DIMENSIONS = 256;
const EMBED_CONCURRENCY = 4;

async function embedOne(text: string): Promise<number[]> {
   const res = await client().send(
      new InvokeModelCommand({
         modelId: EMBED_MODEL_ID,
         contentType: 'application/json',
         accept: 'application/json',
         body: JSON.stringify({
            inputText: text.slice(0, 8000),
            dimensions: EMBED_DIMENSIONS,
            normalize: true,
         }),
      })
   );
   const parsed = JSON.parse(new TextDecoder().decode(res.body)) as { embedding?: number[] };
   return parsed.embedding ?? [];
}

/**
 * Embeddings de vários textos (o Titan aceita um por chamada), em lotes pequenos.
 * Lança se o Bedrock não responder — quem chama decide o fallback.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
   const out: number[][] = [];
   for (let i = 0; i < texts.length; i += EMBED_CONCURRENCY) {
      const batch = texts.slice(i, i + EMBED_CONCURRENCY);
      out.push(...(await Promise.all(batch.map(embedOne))));
   }
   return out;
}
