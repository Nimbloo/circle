import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   activityEvent,
   issue as issueT,
   issueContent,
   issueLabel,
   issueTriageSuggestion,
   status as statusT,
   team as teamT,
} from '@/db/schema';
import { invokeText } from './agent';
import { getCachedCatalogs } from './catalogs';
import { ApiError } from './errors';
import { publish } from './events';
import { getOrCreateUser } from './users';
import { assertCanWriteIssue, assertCanWriteTeam } from './scope';

/**
 * Triage com IA (#94).
 *
 * Quando uma issue entra na fila de Triage, geramos UMA sugestão (1:1 com a issue):
 * time, prioridade, labels, possíveis duplicatas e um resumo. A sugestão só PROPÕE —
 * quem aplica é o usuário no Accept (por isso ela não conflita com as automações do
 * time, que agem sozinhas).
 *
 * Fonte da sugestão:
 * - `ai`: um `invokeText` (Bedrock) com o catálogo do workspace e os títulos das
 *   últimas issues do time, respondendo JSON estrito (parse defensivo + ancoragem
 *   dos ids no catálogo real).
 * - `heuristic`: fallback local quando o Bedrock não responde (em produção o modelo
 *   está bloqueado até o formulário de use case). Só duplicatas, por similaridade de
 *   Jaccard entre os tokens dos títulos. A UI é honesta sobre isso.
 */

/** Quantas issues do time entram no prompt/na comparação de duplicatas. */
export const TRIAGE_CANDIDATE_LIMIT = 200;
/** Similaridade mínima de Jaccard (tokens do título) para considerar duplicata. */
export const DUPLICATE_MIN_SIMILARITY = 0.5;
/** Teto de duplicatas devolvidas (as mais parecidas primeiro). */
const MAX_DUPLICATES = 5;
/** Teto de sugestões geradas de uma vez ao abrir a fila (protege a latência). */
const QUEUE_GENERATION_LIMIT = 20;

export type TriageSuggestionSource = 'ai' | 'heuristic';

export interface TriageDuplicate {
   issueId: string;
   reason: string;
}

/** JSON persistido em `issue_triage_suggestion.payload`. */
export interface TriageSuggestionPayload {
   /** Time proposto; null quando o modelo não opinou (ou no fallback heurístico). */
   teamId: string | null;
   priorityId: string | null;
   labelIds: string[];
   duplicates: TriageDuplicate[];
   summary: string;
}

/** Duplicata já resolvida para a UI (link + motivo). */
export interface TriageDuplicateRef extends TriageDuplicate {
   identifier: string;
   title: string;
}

export interface TriageSuggestionDto {
   issueId: string;
   source: TriageSuggestionSource;
   teamId: string | null;
   priorityId: string | null;
   labelIds: string[];
   duplicates: TriageDuplicateRef[];
   summary: string;
   createdAt: string;
   appliedAt: string | null;
   dismissedAt: string | null;
}

type Row = typeof issueTriageSuggestion.$inferSelect;

const EMPTY_PAYLOAD: TriageSuggestionPayload = {
   teamId: null,
   priorityId: null,
   labelIds: [],
   duplicates: [],
   summary: '',
};

/** Lê o payload persistido de forma tolerante (linha antiga/manual não derruba o GET). */
function readPayload(raw: unknown): TriageSuggestionPayload {
   if (!raw || typeof raw !== 'object') return EMPTY_PAYLOAD;
   const o = raw as Record<string, unknown>;
   const dups = Array.isArray(o.duplicates) ? o.duplicates : [];
   return {
      teamId: typeof o.teamId === 'string' ? o.teamId : null,
      priorityId: typeof o.priorityId === 'string' ? o.priorityId : null,
      labelIds: Array.isArray(o.labelIds) ? o.labelIds.filter((v) => typeof v === 'string') : [],
      duplicates: dups
         .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
         .filter((d) => typeof d.issueId === 'string')
         .map((d) => ({
            issueId: d.issueId as string,
            reason: typeof d.reason === 'string' ? d.reason : '',
         })),
      summary: typeof o.summary === 'string' ? o.summary : '',
   };
}

/** Resolve identifier/título das duplicatas (as que sumiram do banco caem fora). */
async function toDto(db: Db, row: Row): Promise<TriageSuggestionDto> {
   const payload = readPayload(row.payload);
   const ids = payload.duplicates.map((d) => d.issueId);
   const rows = ids.length
      ? await db
           .select({ id: issueT.id, identifier: issueT.identifier, title: issueT.title })
           .from(issueT)
           .where(inArray(issueT.id, ids))
      : [];
   const byId = new Map(rows.map((r) => [r.id, r]));
   return {
      issueId: row.issueId,
      source: row.source as TriageSuggestionSource,
      teamId: payload.teamId,
      priorityId: payload.priorityId,
      labelIds: payload.labelIds,
      duplicates: payload.duplicates.flatMap((d) => {
         const ref = byId.get(d.issueId);
         return ref ? [{ ...d, identifier: ref.identifier, title: ref.title }] : [];
      }),
      summary: payload.summary,
      createdAt: row.createdAt.toISOString(),
      appliedAt: row.appliedAt?.toISOString() ?? null,
      dismissedAt: row.dismissedAt?.toISOString() ?? null,
   };
}

// ── Heurística de duplicatas (fallback sem IA) ───────────────────────────

/** Tokens significativos do título: minúsculo, sem acento/pontuação, sem tokens de 1 char. */
export function titleTokens(title: string): Set<string> {
   return new Set(
      title
         .normalize('NFD')
         .replace(/[̀-ͯ]/g, '')
         .toLowerCase()
         .split(/[^a-z0-9]+/)
         .filter((t) => t.length > 1)
   );
}

/** Jaccard entre dois conjuntos de tokens (0 quando algum é vazio). */
export function jaccard(a: Set<string>, b: Set<string>): number {
   if (a.size === 0 || b.size === 0) return 0;
   let inter = 0;
   for (const t of a) if (b.has(t)) inter++;
   return inter / (a.size + b.size - inter);
}

interface Candidate {
   id: string;
   identifier: string;
   title: string;
}

/** Duplicatas por similaridade de título (as mais parecidas primeiro). */
export function heuristicDuplicates(title: string, candidates: Candidate[]): TriageDuplicate[] {
   const mine = titleTokens(title);
   return candidates
      .map((c) => ({ c, score: jaccard(mine, titleTokens(c.title)) }))
      .filter((x) => x.score >= DUPLICATE_MIN_SIMILARITY)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_DUPLICATES)
      .map((x) => ({
         issueId: x.c.id,
         reason: `Título ${Math.round(x.score * 100)}% semelhante a ${x.c.identifier}`,
      }));
}

// ── Prompt e parse da resposta do modelo ─────────────────────────────────

interface PromptCatalog {
   teams: { id: string; name: string }[];
   priorities: { id: string; name: string }[];
   labels: { id: string; name: string }[];
}

export function buildTriagePrompt(
   target: { identifier: string; title: string; description: string | null; teamId: string },
   catalog: PromptCatalog,
   candidates: Candidate[]
): string {
   const lines: string[] = [];
   lines.push('You are triaging an incoming issue in a Linear-style issue tracker.');
   lines.push('');
   lines.push(`Issue: ${target.identifier}`);
   lines.push(`Current team: ${target.teamId}`);
   lines.push(`Title: ${target.title}`);
   lines.push(`Description: ${(target.description ?? '').slice(0, 4000) || '(empty)'}`);
   lines.push('');
   lines.push('Teams (id — name):');
   for (const t of catalog.teams) lines.push(`- ${t.id} — ${t.name}`);
   lines.push('');
   lines.push('Priorities (id — name):');
   for (const p of catalog.priorities) lines.push(`- ${p.id} — ${p.name}`);
   lines.push('');
   lines.push('Labels (id — name):');
   for (const l of catalog.labels) lines.push(`- ${l.id} — ${l.name}`);
   lines.push('');
   lines.push(`Recent issues of the team (id | identifier | title), ${candidates.length}:`);
   for (const c of candidates) lines.push(`- ${c.id} | ${c.identifier} | ${c.title}`);
   lines.push('');
   lines.push('Respond with STRICT JSON only (no prose, no markdown fences) in this shape:');
   lines.push(
      '{"teamId":string|null,"priorityId":string|null,"labelIds":string[],"duplicates":[{"issueId":string,"reason":string}],"summary":string}'
   );
   lines.push('Rules:');
   lines.push('- teamId, priorityId and labelIds MUST be ids from the lists above, or null/[].');
   lines.push('- duplicates: issueId MUST be an id from the recent issues list; at most 5.');
   lines.push('- reason: one short sentence explaining why it looks like a duplicate.');
   lines.push('- summary: one or two sentences describing what the issue is about.');
   return lines.join('\n');
}

const ResponseSchema = z.object({
   teamId: z.string().nullish(),
   priorityId: z.string().nullish(),
   labelIds: z.array(z.string()).default([]),
   duplicates: z
      .array(z.object({ issueId: z.string(), reason: z.string().default('') }))
      .default([]),
   summary: z.string().default(''),
});

/** Extrai o primeiro objeto JSON do texto do modelo (tolera prosa/fences em volta). */
function extractJson(text: string): unknown {
   const start = text.indexOf('{');
   const end = text.lastIndexOf('}');
   if (start === -1 || end <= start) throw new SyntaxError('sem objeto JSON');
   return JSON.parse(text.slice(start, end + 1));
}

/**
 * Valida a resposta do modelo e ANCORA todo id no catálogo/candidatos reais — id
 * inventado é descartado em vez de virar FK quebrada no Accept. Lança quando a
 * resposta não é JSON utilizável (quem chama cai no heurístico).
 */
export function parseTriageResponse(
   text: string,
   catalog: PromptCatalog,
   candidates: Candidate[]
): TriageSuggestionPayload {
   const parsed = ResponseSchema.safeParse(extractJson(text));
   if (!parsed.success) throw new SyntaxError('JSON fora do formato esperado');
   const teamIds = new Set(catalog.teams.map((t) => t.id));
   const priorityIds = new Set(catalog.priorities.map((p) => p.id));
   const labelIds = new Set(catalog.labels.map((l) => l.id));
   const candidateIds = new Set(candidates.map((c) => c.id));
   const d = parsed.data;
   const seen = new Set<string>();
   return {
      teamId: d.teamId && teamIds.has(d.teamId) ? d.teamId : null,
      priorityId: d.priorityId && priorityIds.has(d.priorityId) ? d.priorityId : null,
      labelIds: [...new Set(d.labelIds.filter((id) => labelIds.has(id)))],
      duplicates: d.duplicates
         .filter((dup) => candidateIds.has(dup.issueId) && !seen.has(dup.issueId))
         .map((dup) => {
            seen.add(dup.issueId);
            return { issueId: dup.issueId, reason: dup.reason.trim() };
         })
         .slice(0, MAX_DUPLICATES),
      summary: d.summary.trim(),
   };
}

// ── Geração ──────────────────────────────────────────────────────────────

export interface GenerateTriageOptions {
   /** Substitui a chamada ao Bedrock (testes). */
   invoke?: (prompt: string) => Promise<string>;
   /** Regenera mesmo quando já existe uma sugestão persistida. */
   force?: boolean;
}

/** Últimas issues do time (sem a própria), para prompt e comparação de duplicatas. */
async function loadCandidates(db: Db, teamId: string, selfId: string): Promise<Candidate[]> {
   return db
      .select({ id: issueT.id, identifier: issueT.identifier, title: issueT.title })
      .from(issueT)
      .where(and(eq(issueT.teamId, teamId), ne(issueT.id, selfId)))
      .orderBy(desc(issueT.createdAt))
      .limit(TRIAGE_CANDIDATE_LIMIT);
}

/**
 * Gera (e persiste) a sugestão da issue. Nunca lança por causa do modelo: erro de
 * Bedrock, JSON inválido ou credencial ausente caem no heurístico com `source`
 * honesto. Publica `issue updated` para o card aparecer sem refresh.
 */
export async function generateTriageSuggestion(
   db: Db,
   issueId: string,
   opts: GenerateTriageOptions = {}
): Promise<TriageSuggestionDto | null> {
   const [target] = await db.select().from(issueT).where(eq(issueT.id, issueId)).limit(1);
   if (!target) return null;
   if (!opts.force) {
      const existing = await getTriageSuggestion(db, issueId);
      if (existing) return existing;
   }

   const [content] = await db
      .select({ description: issueContent.description })
      .from(issueContent)
      .where(eq(issueContent.issueId, issueId))
      .limit(1);
   const [catalogs, teams, candidates] = await Promise.all([
      getCachedCatalogs(db),
      db.select({ id: teamT.id, name: teamT.name }).from(teamT).orderBy(asc(teamT.id)),
      loadCandidates(db, target.teamId, issueId),
   ]);
   const catalog: PromptCatalog = {
      teams,
      priorities: catalogs.priorities.map((p) => ({ id: p.id, name: p.name })),
      labels: catalogs.labels.map((l) => ({ id: l.id, name: l.name })),
   };

   let payload: TriageSuggestionPayload;
   let source: TriageSuggestionSource = 'ai';
   try {
      const prompt = buildTriagePrompt(
         {
            identifier: target.identifier,
            title: target.title,
            description: content?.description ?? null,
            teamId: target.teamId,
         },
         catalog,
         candidates
      );
      const text = await (opts.invoke ?? invokeText)(prompt);
      if (typeof text !== 'string' || text.trim() === '')
         throw new SyntaxError('resposta vazia do modelo');
      payload = parseTriageResponse(text, catalog, candidates);
   } catch (e) {
      // Bedrock bloqueado/fora do ar OU resposta inutilizável → duplicatas locais.
      console.warn(`[circle] triage sem IA (${issueId}):`, (e as Error).message);
      source = 'heuristic';
      payload = {
         ...EMPTY_PAYLOAD,
         duplicates: heuristicDuplicates(target.title, candidates),
      };
   }

   const now = new Date();
   // A coluna é jsonb genérico (`Record<string, unknown>`); a forma tipada é o
   // `TriageSuggestionPayload`, reconstruído na leitura por `readPayload`.
   const stored = { ...payload } as unknown as Record<string, unknown>;
   await db
      .insert(issueTriageSuggestion)
      .values({ issueId, payload: stored, source, createdAt: now })
      .onConflictDoUpdate({
         target: issueTriageSuggestion.issueId,
         set: { payload: stored, source, createdAt: now, appliedAt: null, dismissedAt: null },
      });
   publish({ entity: 'issue', action: 'updated', id: issueId });
   return getTriageSuggestion(db, issueId);
}

/**
 * Dispara a geração em background (fire-and-forget) ao entrar em Triage. Chamado de
 * `createIssue`/`updateIssue` por import dinâmico — a latência do modelo NUNCA entra
 * no caminho da mutação, e o card chega pelo evento realtime.
 */
export function scheduleTriageSuggestion(db: Db, issueId: string): void {
   void generateTriageSuggestion(db, issueId).catch((e) => {
      console.warn(`[circle] geração de triage falhou (${issueId}):`, (e as Error).message);
   });
}

// ── Leitura ──────────────────────────────────────────────────────────────

export async function getTriageSuggestion(
   db: Db,
   issueId: string
): Promise<TriageSuggestionDto | null> {
   const [row] = await db
      .select()
      .from(issueTriageSuggestion)
      .where(eq(issueTriageSuggestion.issueId, issueId))
      .limit(1);
   return row ? toDto(db, row) : null;
}

/**
 * Sugestão da issue, gerando na hora quando ainda não existe (lazy do GET do painel).
 * 404 quando a issue não existe.
 */
export async function ensureTriageSuggestion(
   db: Db,
   issueId: string,
   opts: GenerateTriageOptions = {}
): Promise<TriageSuggestionDto> {
   const existing = await getTriageSuggestion(db, issueId);
   if (existing) return existing;
   const generated = await generateTriageSuggestion(db, issueId, opts);
   if (!generated) throw new ApiError(404, `Issue '${issueId}' não encontrada`);
   return generated;
}

export interface QueueSuggestionsOptions extends GenerateTriageOptions {
   /**
    * Espera as sugestões faltantes serem geradas antes de responder. Default `false`:
    * a fila renderiza na hora e os cards chegam pelo evento realtime.
    */
   wait?: boolean;
}

/**
 * Sugestões da fila de Triage de um time (as que existem) e geração LAZY das que
 * faltam. Sem CronJob: quem abre a fila é quem dispara a geração.
 */
export async function listTeamTriageSuggestions(
   db: Db,
   teamId: string,
   opts: QueueSuggestionsOptions = {}
): Promise<TriageSuggestionDto[]> {
   const triageStatuses = await db
      .select({ id: statusT.id })
      .from(statusT)
      .where(eq(statusT.category, 'triage'));
   if (triageStatuses.length === 0) return [];
   const queue = await db
      .select({ id: issueT.id })
      .from(issueT)
      .where(
         and(
            eq(issueT.teamId, teamId),
            inArray(
               issueT.statusId,
               triageStatuses.map((s) => s.id)
            ),
            // Issue adiada some da fila — e não gasta uma chamada ao modelo.
            sql`(${issueT.snoozedUntil} is null or ${issueT.snoozedUntil} <= now())`
         )
      )
      .orderBy(asc(issueT.rank));
   if (queue.length === 0) return [];

   const ids = queue.map((q) => q.id);
   const rows = await db
      .select()
      .from(issueTriageSuggestion)
      .where(inArray(issueTriageSuggestion.issueId, ids));
   const have = new Set(rows.map((r) => r.issueId));
   const missing = ids.filter((id) => !have.has(id)).slice(0, QUEUE_GENERATION_LIMIT);

   if (opts.wait) {
      for (const id of missing) await generateTriageSuggestion(db, id, opts);
      const refreshed = await db
         .select()
         .from(issueTriageSuggestion)
         .where(inArray(issueTriageSuggestion.issueId, ids));
      return Promise.all(refreshed.map((r) => toDto(db, r)));
   }
   for (const id of missing) scheduleTriageSuggestion(db, id);
   return Promise.all(rows.map((r) => toDto(db, r)));
}

// ── Accept / Dismiss ─────────────────────────────────────────────────────

/** Campos que o usuário pode sobrescrever no Accept (o "Edit" da UI). */
export interface AcceptTriageInput {
   teamId?: string | null;
   priorityId?: string | null;
   labelIds?: string[];
   duplicateIds?: string[];
}

/**
 * Move a issue de time: `team_id` + identifier NOVO (a numeração é por time). Só é
 * chamado quando o time sugerido difere do atual.
 */
async function moveIssueToTeam(db: Db, issueId: string, teamId: string): Promise<string> {
   const [seq] = await db
      .update(teamT)
      .set({ issueSeq: sql`${teamT.issueSeq} + 1` })
      .where(eq(teamT.id, teamId))
      .returning({ seq: teamT.issueSeq });
   if (!seq) throw new ApiError(400, `Team '${teamId}' não existe`);
   const identifier = `${teamId}-${seq.seq}`;
   await db.update(issueT).set({ teamId, identifier }).where(eq(issueT.id, issueId));
   return identifier;
}

/**
 * Aplica a sugestão: time, prioridade, labels e o 1º status `unstarted` (a issue sai
 * da fila), relaciona as duplicatas como `related`, registra a activity e carimba
 * `applied_at`. `input` sobrescreve o que o usuário editou no card.
 */
export async function acceptTriageSuggestion(
   db: Db,
   issueId: string,
   actorEmail: string,
   input: AcceptTriageInput = {}
): Promise<TriageSuggestionDto> {
   // Escopo ANTES de qualquer lookup: a issue de ORIGEM e o time de DESTINO (o accept
   // move a issue de time). Checar depois devolveria 404 da sugestão no lugar do 403.
   const scope = await assertCanWriteIssue(db, actorEmail, issueId);
   if (input.teamId) await assertCanWriteTeam(db, scope, input.teamId);
   const suggestion = await getTriageSuggestion(db, issueId);
   if (!suggestion) throw new ApiError(404, 'Sugestão de triagem não encontrada');
   if (suggestion.appliedAt) throw new ApiError(409, 'Sugestão já aplicada');
   const [target] = await db.select().from(issueT).where(eq(issueT.id, issueId)).limit(1);
   if (!target) throw new ApiError(404, `Issue '${issueId}' não encontrada`);

   const actor = await getOrCreateUser(db, actorEmail);
   const catalogs = await getCachedCatalogs(db);
   const teamId = input.teamId !== undefined ? input.teamId : suggestion.teamId;
   const priorityId = input.priorityId !== undefined ? input.priorityId : suggestion.priorityId;
   const labelIds = input.labelIds ?? suggestion.labelIds;
   const duplicateIds = input.duplicateIds ?? suggestion.duplicates.map((d) => d.issueId);

   if (priorityId && !catalogs.priorities.some((p) => p.id === priorityId))
      throw new ApiError(400, `Priority '${priorityId}' não existe`);
   const knownLabels = new Set(catalogs.labels.map((l) => l.id));
   const unknownLabel = labelIds.find((id) => !knownLabels.has(id));
   if (unknownLabel) throw new ApiError(400, `Label '${unknownLabel}' não existe`);

   // 1º status `unstarted` (a fila de triage é abandonada por ele) — igual ao Accept
   // do menu de contexto, que usa unstarted com fallback em started.
   const open =
      catalogs.statuses
         .filter((s) => s.category === 'unstarted')
         .sort((a, b) => a.position - b.position)[0] ??
      catalogs.statuses
         .filter((s) => s.category === 'started')
         .sort((a, b) => a.position - b.position)[0];
   if (!open) throw new ApiError(409, 'Nenhum status aberto configurado no workspace');

   // Time primeiro: o identifier muda, e as etapas seguintes já usam o novo.
   const movedTeam = !!teamId && teamId !== target.teamId;
   if (movedTeam) await moveIssueToTeam(db, issueId, teamId!);

   if (labelIds.length) {
      await db
         .insert(issueLabel)
         .values(labelIds.map((labelId) => ({ issueId, labelId })))
         .onConflictDoNothing();
   }

   // Status/prioridade pelo caminho normal: SLA, automações de status e notificações
   // continuam valendo (o usuário mudou a issue — a sugestão só propôs).
   const { updateIssue } = await import('./issues');
   await updateIssue(
      db,
      issueId,
      { statusId: open.id, ...(priorityId ? { priorityId } : {}) },
      actorEmail
   );

   // Duplicatas viram relação `related` (nunca fecham a issue sozinhas).
   const { addRelation } = await import('./issue-detail');
   for (const relatedId of duplicateIds) {
      if (relatedId === issueId) continue;
      try {
         await addRelation(db, issueId, relatedId, 'related', actorEmail);
      } catch (e) {
         // Duplicata apagada entre a sugestão e o Accept não pode derrubar o Accept.
         console.warn(`[circle] relação de duplicata ignorada (${relatedId}):`, e);
      }
   }

   const parts = [`moved to ${open.name}`];
   if (movedTeam) parts.push(`team ${teamId}`);
   if (priorityId)
      parts.push(
         `priority ${catalogs.priorities.find((p) => p.id === priorityId)?.name ?? priorityId}`
      );
   if (labelIds.length) parts.push(`${labelIds.length} label(s)`);
   if (duplicateIds.length) parts.push(`${duplicateIds.length} duplicate(s) linked`);
   await db.insert(activityEvent).values({
      id: randomUUID(),
      issueId,
      actorId: actor.id,
      event: 'triage',
      text: `triaged with suggestion (${parts.join(', ')})`,
      createdAt: new Date(),
   });

   await db
      .update(issueTriageSuggestion)
      .set({ appliedAt: new Date(), dismissedAt: null })
      .where(eq(issueTriageSuggestion.issueId, issueId));
   publish({ entity: 'issue', action: 'updated', id: issueId });
   return (await getTriageSuggestion(db, issueId))!;
}

/** Descarta a sugestão (some do card; a issue segue na fila para triagem manual). */
export async function dismissTriageSuggestion(
   db: Db,
   issueId: string,
   actorEmail?: string
): Promise<TriageSuggestionDto> {
   if (actorEmail) await assertCanWriteIssue(db, actorEmail, issueId);
   const [updated] = await db
      .update(issueTriageSuggestion)
      .set({ dismissedAt: new Date() })
      .where(
         and(eq(issueTriageSuggestion.issueId, issueId), isNull(issueTriageSuggestion.dismissedAt))
      )
      .returning();
   const current = updated ? await toDto(db, updated) : await getTriageSuggestion(db, issueId);
   if (!current) throw new ApiError(404, 'Sugestão de triagem não encontrada');
   if (updated) publish({ entity: 'issue', action: 'updated', id: issueId });
   return current;
}
