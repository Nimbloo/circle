import { createHash } from 'node:crypto';
import { and, asc, count, desc, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import type { GuideSection } from '@/data/reviews';
import {
   review,
   reviewCommit,
   reviewFile,
   issue as issueT,
   issuePrLink,
   status as statusT,
} from '@/db/schema';
import { ApiError } from './errors';
import { publish } from './events';
import { runAutomations } from './automations';
import { notifySlackEvent } from './integrations/slack';
import {
   latestVerdict,
   listReviewComments,
   type ReviewCommentDto,
   type ReviewVerdictDto,
} from './review-comments';

/** Status do review (open|merged|closed) → status do link de PR na issue (open|merged|draft). */
function prLinkStatus(reviewStatus: string): string {
   return reviewStatus === 'merged' ? 'merged' : 'open';
}

type ReviewRow = typeof review.$inferSelect;

export interface ReviewDto {
   id: string;
   title: string;
   status: string; // open|merged|closed
   repo: string;
   prNumber: number;
   url: string | null;
   author: string | null;
   targetBranch: string | null;
   sourceBranch: string | null;
   additions: number;
   deletions: number;
   resolves: { identifier: string; title: string } | null;
   checksPassed: number;
   checksTotal: number;
   createdAt: string;
}

/**
 * Colunas da LISTA (#39): tudo menos o `guide` (JSON do guia de review, grande e só
 * usado no detalhe). `select()` sem projeção trazia o guia de cada PR da página.
 */
const { guide: _guide, ...listColumns } = getTableColumns(review);
void _guide;

function toDto(r: Omit<ReviewRow, 'guide'>): ReviewDto {
   return {
      id: r.id,
      title: r.title,
      status: r.status,
      repo: r.repo,
      prNumber: r.prNumber,
      url: r.url,
      author: r.author,
      targetBranch: r.targetBranch,
      sourceBranch: r.sourceBranch,
      additions: r.additions,
      deletions: r.deletions,
      resolves: r.resolvesIdentifier
         ? { identifier: r.resolvesIdentifier, title: r.resolvesTitle ?? '' }
         : null,
      checksPassed: r.checksPassed,
      checksTotal: r.checksTotal,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
   };
}

export interface ListReviewsOptions {
   status?: string;
   /** Conjunto de status (filtro da lista no servidor); combinado com `status`, se vier. */
   statuses?: string[];
   limit?: number;
   offset?: number;
   /**
    * Recorte por pessoa. Exige `viewerLogin` — sem o handle do GitHub no perfil não há
    * como ligar o PR (que guarda o login) ao usuário do Circle, e a lista volta vazia
    * em vez de fingir que é 'tudo'.
    *  - `created`: PRs abertos por mim.
    *  - `for-you`: PRs em que fui solicitado como reviewer.
    */
   list?: 'created' | 'for-you';
   viewerLogin?: string | null;
}

export interface ReviewPage {
   items: ReviewDto[];
   total: number;
}

/**
 * Lista PRs sincronizados, paginado (limit/offset, default limit=50) + total do
 * conjunto (respeitando o filtro de status), pra a UI mostrar "X de Y" e o load-more.
 */
/** Logins solicitados como reviewer, em CSV. Null quando o payload não os traz. */
function reviewersCsv(pr: { requested_reviewers?: { login?: string }[] | null }): string | null {
   const logins = (pr.requested_reviewers ?? [])
      .map((r) => r?.login)
      .filter((l): l is string => Boolean(l));
   return logins.length ? clip(logins.join(','), 512) : null;
}

export async function listReviews(db: Db, opts: ListReviewsOptions = {}): Promise<ReviewPage> {
   const limit = opts.limit ?? 50;
   const offset = opts.offset ?? 0;
   const login = opts.viewerLogin?.trim();
   const clauses = [];
   if (opts.status) clauses.push(eq(review.status, opts.status));
   if (opts.statuses?.length) clauses.push(inArray(review.status, opts.statuses));
   if (opts.list === 'created') {
      // Sem handle configurado, a clausula falsa devolve lista vazia — honesto. Antes as
      // duas abas mostravam o mesmo conjunto e ninguém percebia que não filtravam.
      clauses.push(login ? eq(review.author, login) : sql`false`);
   } else if (opts.list === 'for-you') {
      // CSV com vírgulas nas bordas: casa o login inteiro, sem pegar `ana` dentro de
      // `ana-maria`.
      clauses.push(
         login
            ? sql`(',' || ${review.requestedReviewers} || ',') like ${'%,' + login + ',%'}`
            : sql`false`
      );
   }
   // `where(undefined)` = sem filtro: uma query só, sem o ternário duplicado.
   const where = clauses.length ? and(...clauses) : undefined;
   const [rows, countRows] = await Promise.all([
      db
         .select(listColumns)
         .from(review)
         .where(where)
         .orderBy(desc(review.createdAt))
         .limit(limit)
         .offset(offset),
      db.select({ c: count() }).from(review).where(where),
   ]);
   const total = Number(countRows[0]?.c ?? 0);

   return { items: rows.map(toDto), total };
}

export interface ReviewFileDto {
   path: string;
   status: string; // added|modified|removed|renamed
   additions: number;
   deletions: number;
   /** Unified diff do arquivo como o GitHub devolve; null para binário/arquivo grande. */
   patch: string | null;
}

export interface ReviewCommitDto {
   sha: string;
   message: string;
   author: string | null;
   committedAt: string | null;
}

/** Guia de review gerado a partir do diff (persistido em `review.guide` como JSON). */
export interface ReviewGuideDto {
   sections: GuideSection[];
   generatedAt: string;
   model: string;
}

/**
 * Detalhe do review: o PR + arquivos, commits, guia, a thread de comentários e o veredito
 * corrente (último `approve`/`request_changes`) — aditivo ao `ReviewDto`.
 */
export interface ReviewDetailDto extends ReviewDto {
   files: ReviewFileDto[];
   commits: ReviewCommitDto[];
   guide: ReviewGuideDto | null;
   comments: ReviewCommentDto[];
   verdict: ReviewVerdictDto | null;
}

function toIso(d: Date | string | null): string | null {
   if (!d) return null;
   return d instanceof Date ? d.toISOString() : String(d);
}

/** Lê o JSON do guia; coluna vazia ou corrompida → null (a UI mostra o estado vazio). */
export function parseGuide(raw: string | null): ReviewGuideDto | null {
   if (!raw) return null;
   try {
      const g = JSON.parse(raw) as Partial<ReviewGuideDto>;
      if (!g || !Array.isArray(g.sections) || typeof g.generatedAt !== 'string') return null;
      return { sections: g.sections, generatedAt: g.generatedAt, model: String(g.model ?? '') };
   } catch {
      return null;
   }
}

export interface GetReviewOptions {
   token?: string;
   fetchImpl?: FetchLike;
}

/**
 * Detalhe do review. Se o PR nunca teve arquivos/commits buscados (`depthSyncedAt`
 * nulo — caso dos PRs antigos, fechados antes da ingestão de profundidade) e há token,
 * busca UMA vez do GitHub, persiste e devolve já preenchido. Nunca acontece no listing.
 */
export async function getReview(
   db: Db,
   id: string,
   opts: GetReviewOptions = {}
): Promise<ReviewDetailDto | null> {
   const rows = await db.select().from(review).where(eq(review.id, id)).limit(1);
   if (!rows.length) return null;
   let row = rows[0];
   let [files, commits] = await loadDepth(db, id);
   const comments = await listReviewComments(db, id);

   const token = opts.token ?? process.env.GITHUB_TOKEN;
   if (files.length === 0 && commits.length === 0 && !row.depthSyncedAt && token) {
      await hydrateDepthOnDemand(db, row, token, opts.fetchImpl ?? fetch);
      const fresh = await db.select().from(review).where(eq(review.id, id)).limit(1);
      if (fresh.length) row = fresh[0];
      [files, commits] = await loadDepth(db, id);
   }

   return {
      ...toDto(row),
      guide: parseGuide(row.guide),
      files: files.map((f) => ({
         path: f.path,
         status: f.status,
         additions: f.additions,
         deletions: f.deletions,
         patch: f.patch,
      })),
      commits: commits.map((c) => ({
         sha: c.sha,
         message: c.message,
         author: c.author,
         committedAt: toIso(c.committedAt),
      })),
      comments,
      verdict: latestVerdict(comments),
   };
}

async function loadDepth(db: Db, id: string) {
   return Promise.all([
      db.select().from(reviewFile).where(eq(reviewFile.reviewId, id)).orderBy(asc(reviewFile.path)),
      db
         .select()
         .from(reviewCommit)
         .where(eq(reviewCommit.reviewId, id))
         .orderBy(asc(reviewCommit.committedAt), asc(reviewCommit.sha)),
   ]);
}

/**
 * Busca arquivos/commits/checks de um PR que nunca os teve (GET individual do PR para
 * obter o `head.sha` dos checks + `fetchPrDepth`). Best-effort: qualquer falha devolve
 * sem lançar. `depthSyncedAt` é marcado MESMO em falha — senão cada abertura do detalhe
 * bateria de novo na API do GitHub (rate-limit) sem chance de resultado diferente.
 */
async function hydrateDepthOnDemand(
   db: Db,
   row: ReviewRow,
   token: string,
   doFetch: FetchLike
): Promise<void> {
   try {
      const pr = await ghGet<GitHubPr>(
         `https://api.github.com/repos/${row.repo}/pulls/${row.prNumber}`,
         token,
         doFetch
      );
      const depth = await fetchPrDepth(
         row.repo,
         pr && typeof pr === 'object' ? pr : { number: row.prNumber },
         token,
         doFetch
      );
      if (depth.checks) {
         await db
            .update(review)
            .set({ checksPassed: depth.checks.passed, checksTotal: depth.checks.total })
            .where(eq(review.id, row.id));
      }
      await persistPrDepth(db, row.id, depth);
   } catch (e) {
      console.warn(`[circle] profundidade sob demanda falhou (${row.id}):`, (e as Error).message);
   } finally {
      // Marca a tentativa (persistPrDepth só marca quando gravou algo).
      await db
         .update(review)
         .set({ depthSyncedAt: new Date() })
         .where(and(eq(review.id, row.id), isNull(review.depthSyncedAt)));
   }
}

// ── Ingestão do GitHub ────────────────────────────────────────────
interface GitHubPr {
   number: number;
   title: string;
   state: string; // open|closed
   merged_at: string | null;
   html_url: string;
   created_at: string;
   /** Momento da última mudança do PR no GitHub — ordena entregas do webhook (Co#19). */
   updated_at?: string | null;
   user?: { login: string };
   requested_reviewers?: { login?: string }[] | null;
   body?: string | null;
   base?: { ref: string };
   head?: { ref: string; sha?: string };
   // Só presentes no GET individual do PR (a lista /pulls não os retorna).
   additions?: number;
   deletions?: number;
   changed_files?: number;
}

type FetchLike = typeof fetch;

// Paginação da lista /pulls e cap do fetch de detalhe (evita queimar rate-limit
// em ~86 repos). MAX_PAGES × PER_PAGE = teto de PRs varridos por repo.
const PER_PAGE = 50;
const MAX_PAGES = 5; // 500 PRs/repo — PRs antigos além disso não são varridos
// Cada PR aberto custa 4 chamadas (detalhe, files, commits, check-runs) → lote menor.
const DETAIL_CONCURRENCY = 4;

function ghHeaders(token: string): HeadersInit {
   return {
      'authorization': `Bearer ${token}`,
      'accept': 'application/vnd.github+json',
      'user-agent': 'circle-nimbloo',
   };
}

function statusOf(pr: GitHubPr): string {
   if (pr.merged_at) return 'merged';
   if (pr.state === 'closed') return 'closed';
   return 'open';
}

/** Candidatos a identifier de issue (ex "LNUI-701") no título, branch e corpo do PR, na
 * ordem em que aparecem (paridade Linear: reconhece o id nos três lugares). */
function resolveCandidates(...sources: (string | null | undefined)[]): string[] {
   const out: string[] = [];
   for (const s of sources) {
      if (!s) continue;
      // case-insensitive: branches usam minúsculo (core-42-...).
      for (const m of s.matchAll(/\b([A-Za-z]{2,}-\d+)\b/g)) {
         const id = m[1].toUpperCase();
         if (!out.includes(id)) out.push(id);
      }
   }
   return out;
}

/** Tamanho do lote na busca de identifiers (bem abaixo do teto de parâmetros). */
const IDENTIFIER_LOOKUP_CHUNK = 1000;

/**
 * Quais candidatos são issues que existem. Só esses viram `resolves_identifier`: "UTF-8"
 * no título não é ticket, e o sync não pode restaurar o vínculo de uma issue apagada.
 */
async function existingIdentifiers(db: Db, candidates: string[]): Promise<Set<string>> {
   const unique = [...new Set(candidates)];
   const found = new Set<string>();
   // Em lotes: o corpo de um PR pode listar muitos identifiers, e um sync junta centenas
   // de PRs — uma lista só estouraria o teto de parâmetros do Postgres.
   for (let i = 0; i < unique.length; i += IDENTIFIER_LOOKUP_CHUNK) {
      const rows = await db
         .select({ identifier: issueT.identifier })
         .from(issueT)
         .where(inArray(issueT.identifier, unique.slice(i, i + IDENTIFIER_LOOKUP_CHUNK)));
      for (const r of rows) found.add(r.identifier);
   }
   return found;
}

export interface SyncOptions {
   repos?: string[]; // owner/repo
   token?: string;
   fetchImpl?: FetchLike;
}

/**
 * Puxa PRs dos repos configurados via GitHub API e faz upsert na tabela review.
 * Config via env (GITHUB_TOKEN, CIRCLE_GITHUB_REPOS csv) ou params. Retorna nº sincronizado.
 */
export async function syncFromGitHub(db: Db, opts: SyncOptions = {}): Promise<number> {
   const token = opts.token ?? process.env.GITHUB_TOKEN;
   const repos =
      opts.repos ??
      (process.env.CIRCLE_GITHUB_REPOS ?? '')
         .split(',')
         .map((s) => s.trim())
         .filter(Boolean);
   const doFetch = opts.fetchImpl ?? fetch;
   if (!token) throw new ApiError(400, 'GITHUB_TOKEN não configurado');
   if (repos.length === 0) throw new ApiError(400, 'CIRCLE_GITHUB_REPOS não configurado');

   // Paraleliza o fetch/upsert dos repos em lotes (~86 repos ⇒ evita timeout
   // do fetch sequencial). Concorrência limitada p/ não estourar rate limit.
   const CONCURRENCY = 8;
   let count = 0;
   for (let i = 0; i < repos.length; i += CONCURRENCY) {
      const batch = repos.slice(i, i + CONCURRENCY);
      const counts = await Promise.all(batch.map((repo) => syncRepo(db, repo, token, doFetch)));
      count += counts.reduce((a, b) => a + b, 0);
   }
   // Só avisa quando algo mudou de fato: sync sem novidade não precisa acordar cliente.
   if (count > 0) publish({ entity: 'review', action: 'updated' });
   return count;
}

/** Lê uma página de /pulls (retorna [] em erro/formato inesperado). */
async function fetchPrPage(
   repo: string,
   token: string,
   doFetch: FetchLike,
   page: number
): Promise<GitHubPr[]> {
   const res = await doFetch(
      `https://api.github.com/repos/${repo}/pulls?state=all&per_page=${PER_PAGE}&page=${page}`,
      { headers: ghHeaders(token), signal: AbortSignal.timeout(10_000) }
   );
   if (!res.ok) {
      // rate-limit/401/404 do GitHub: loga (senão o sync subconta em silêncio) e segue.
      console.warn(`[circle] github /pulls ${repo} p${page} → HTTP ${res.status}`);
      return [];
   }
   const prs = await res.json();
   return Array.isArray(prs) ? (prs as GitHubPr[]) : [];
}

/**
 * GET individual do PR — única fonte de additions/deletions/changed_files (a lista
 * /pulls não os retorna). Best-effort: retorna null em qualquer falha (o sync segue
 * com 0). `changed_files`/checks não são persistidos (não há coluna na tabela review).
 */
async function fetchPrDetail(
   repo: string,
   prNumber: number,
   token: string,
   doFetch: FetchLike
): Promise<{ additions: number; deletions: number } | null> {
   try {
      const res = await doFetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, {
         headers: ghHeaders(token),
         signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const d = (await res.json()) as GitHubPr;
      if (!d || typeof d !== 'object') return null;
      return { additions: Number(d.additions) || 0, deletions: Number(d.deletions) || 0 };
   } catch {
      return null;
   }
}

// ── Profundidade do PR: arquivos, commits e checks ────────────────
interface GitHubFile {
   filename: string;
   status?: string; // added|modified|removed|renamed
   additions?: number;
   deletions?: number;
   patch?: string | null; // omitido pelo GitHub em binários/arquivos grandes
}

interface GitHubCommit {
   sha: string;
   commit?: { message?: string; author?: { name?: string; date?: string } | null } | null;
   author?: { login?: string } | null;
}

interface CheckRunsResponse {
   total_count?: number;
   check_runs?: { conclusion?: string | null }[];
}

interface PrChecks {
   passed: number;
   total: number;
}

/** O que foi buscado do PR — null em cada parte que falhou (best-effort). */
interface PrDepth {
   files: GitHubFile[] | null;
   commits: GitHubCommit[] | null;
   checks: PrChecks | null;
}

const FILES_PER_PAGE = 100;
const FILES_MAX_PAGES = 3; // 300 arquivos — acima disso a lista da UI fica truncada
const PASSED_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);

/** GET JSON best-effort: null em erro HTTP, timeout ou corpo inesperado. */
async function ghGet<T>(url: string, token: string, doFetch: FetchLike): Promise<T | null> {
   try {
      const res = await doFetch(url, {
         headers: ghHeaders(token),
         signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
   } catch {
      return null;
   }
}

async function fetchPrFiles(
   repo: string,
   prNumber: number,
   token: string,
   doFetch: FetchLike
): Promise<GitHubFile[] | null> {
   const files: GitHubFile[] = [];
   for (let page = 1; page <= FILES_MAX_PAGES; page += 1) {
      const pageFiles = await ghGet<GitHubFile[]>(
         `https://api.github.com/repos/${repo}/pulls/${prNumber}/files?per_page=${FILES_PER_PAGE}&page=${page}`,
         token,
         doFetch
      );
      // 1ª página falhou → sem dado; página seguinte falhou → fica com o que já veio.
      if (!Array.isArray(pageFiles)) return page === 1 ? null : files;
      files.push(...pageFiles);
      if (pageFiles.length < FILES_PER_PAGE) break;
   }
   return files;
}

async function fetchPrCommits(
   repo: string,
   prNumber: number,
   token: string,
   doFetch: FetchLike
): Promise<GitHubCommit[] | null> {
   const commits = await ghGet<GitHubCommit[]>(
      `https://api.github.com/repos/${repo}/pulls/${prNumber}/commits?per_page=100`,
      token,
      doFetch
   );
   return Array.isArray(commits) ? commits : null;
}

/** Checks do commit da cabeça do PR: passed = success|neutral|skipped, total = total_count. */
async function fetchPrChecks(
   repo: string,
   headSha: string | undefined,
   token: string,
   doFetch: FetchLike
): Promise<PrChecks | null> {
   if (!headSha) return null;
   const data = await ghGet<CheckRunsResponse>(
      `https://api.github.com/repos/${repo}/commits/${headSha}/check-runs?per_page=100`,
      token,
      doFetch
   );
   if (!data || !Array.isArray(data.check_runs)) return null;
   const passed = data.check_runs.filter((c) => PASSED_CONCLUSIONS.has(c.conclusion ?? '')).length;
   return { passed, total: Number(data.total_count ?? data.check_runs.length) || 0 };
}

async function fetchPrDepth(
   repo: string,
   pr: Pick<GitHubPr, 'number' | 'head'>,
   token: string,
   doFetch: FetchLike
): Promise<PrDepth> {
   const [files, commits, checks] = await Promise.all([
      fetchPrFiles(repo, pr.number, token, doFetch),
      fetchPrCommits(repo, pr.number, token, doFetch),
      fetchPrChecks(repo, pr.head?.sha, token, doFetch),
   ]);
   return { files, commits, checks };
}

/**
 * Substitui arquivos e commits do review (delete + insert na mesma transação) e marca
 * `depthSyncedAt`. Só toca no que foi buscado com sucesso — uma falha em /files não
 * apaga a lista anterior.
 */
async function persistPrDepth(db: Db, reviewId: string, depth: PrDepth): Promise<void> {
   if (!depth.files && !depth.commits) return;
   await db.transaction(async (tx) => {
      await tx.update(review).set({ depthSyncedAt: new Date() }).where(eq(review.id, reviewId));
      if (depth.files) {
         await tx.delete(reviewFile).where(eq(reviewFile.reviewId, reviewId));
         const seen = new Set<string>();
         const rows = depth.files
            .filter((f) => typeof f.filename === 'string' && f.filename && !seen.has(f.filename))
            .map((f) => {
               seen.add(f.filename);
               return {
                  reviewId,
                  path: clip(f.filename, 512),
                  status: clip(f.status || 'modified', 16),
                  additions: Number(f.additions) || 0,
                  deletions: Number(f.deletions) || 0,
                  patch: typeof f.patch === 'string' ? f.patch : null,
               };
            });
         for (let i = 0; i < rows.length; i += 50) {
            await tx.insert(reviewFile).values(rows.slice(i, i + 50));
         }
      }
      if (depth.commits) {
         await tx.delete(reviewCommit).where(eq(reviewCommit.reviewId, reviewId));
         const seen = new Set<string>();
         const rows = depth.commits
            .filter((c) => typeof c.sha === 'string' && c.sha && !seen.has(c.sha))
            .map((c) => {
               seen.add(c.sha);
               const date = c.commit?.author?.date ? new Date(c.commit.author.date) : null;
               return {
                  reviewId,
                  sha: clip(c.sha, 40),
                  message: clip(c.commit?.message || '', 512),
                  author: clip(c.author?.login ?? null, 128),
                  committedAt: date && !Number.isNaN(date.getTime()) ? date : null,
               };
            });
         for (let i = 0; i < rows.length; i += 50) {
            await tx.insert(reviewCommit).values(rows.slice(i, i + 50));
         }
      }
   });
}

/** Puxa os PRs de um repo (paginado) e faz upsert. Retorna quantos foram sincronizados. */
async function syncRepo(db: Db, repo: string, token: string, doFetch: FetchLike): Promise<number> {
   // Pagina /pulls até acabar ou atingir o teto (PRs antigos além do teto ficam de fora).
   const prs: GitHubPr[] = [];
   for (let page = 1; page <= MAX_PAGES; page += 1) {
      const pagePrs = await fetchPrPage(repo, token, doFetch, page);
      prs.push(...pagePrs);
      if (pagePrs.length < PER_PAGE) break; // última página
   }
   if (prs.length === 0) return 0;

   // Cap de rate-limit: busca o detalhe (additions/deletions) SÓ dos PRs open, em
   // lotes concorrentes. PRs closed/merged mantêm o valor já persistido (0 se nunca
   // teve detalhe) — não sobrescrevemos com 0 no upsert.
   const openPrs = prs.filter((pr) => statusOf(pr) === 'open');
   const detailByNumber = new Map<number, { additions: number; deletions: number }>();
   // Arquivos/commits/checks seguem o mesmo cap: só PRs open, mesmo lote.
   const depthByNumber = new Map<number, PrDepth>();
   for (let i = 0; i < openPrs.length; i += DETAIL_CONCURRENCY) {
      const batch = openPrs.slice(i, i + DETAIL_CONCURRENCY);
      const results = await Promise.all(
         batch.map(async (pr) => {
            const [detail, depth] = await Promise.all([
               fetchPrDetail(repo, pr.number, token, doFetch),
               fetchPrDepth(repo, pr, token, doFetch),
            ]);
            return { detail, depth };
         })
      );
      batch.forEach((pr, idx) => {
         const { detail, depth } = results[idx];
         if (detail) detailByNumber.set(pr.number, detail);
         depthByNumber.set(pr.number, depth);
      });
   }

   let count = 0;
   // Auto-link PR↔issue (paridade Linear): PRs cujo título referencia um identifier
   // (ex.: CORE-123) viram linha em issue_pr_link, populando o painel "PR links" da
   // issue. Coletado no loop e resolvido em batch no fim (1 query por identifier set).
   const links: PrLinkInput[] = [];
   const candidatesByPr = new Map(
      prs.map((pr) => [pr.number, resolveCandidates(pr.title, pr.head?.ref, pr.body)])
   );
   const existing = await existingIdentifiers(db, [...candidatesByPr.values()].flat());
   for (const pr of prs) {
      const resolvesId = candidatesByPr.get(pr.number)?.find((id) => existing.has(id)) ?? null;
      const detail = detailByNumber.get(pr.number);
      const depth = depthByNumber.get(pr.number);
      const row = {
         id: `${repo}#${pr.number}`,
         // clip: trunca ao limite da coluna — títulos/branches de PR podem passar de
         // 512/196 chars e estouravam o insert (varchar overflow abortava o batch).
         title: clip(pr.title, 512),
         status: statusOf(pr),
         repo: clip(repo, 196),
         prNumber: pr.number,
         url: clip(pr.html_url ?? null, 512),
         author: clip(pr.user?.login ?? null, 128),
         requestedReviewers: reviewersCsv(pr),
         targetBranch: clip(pr.base?.ref ?? null, 196),
         sourceBranch: clip(pr.head?.ref ?? null, 196),
         additions: detail?.additions ?? pr.additions ?? 0,
         deletions: detail?.deletions ?? pr.deletions ?? 0,
         resolvesIdentifier: resolvesId,
         resolvesTitle: resolvesId ? clip(pr.title, 512) : null,
         checksPassed: depth?.checks?.passed ?? 0,
         checksTotal: depth?.checks?.total ?? 0,
         createdAt: new Date(pr.created_at),
         syncedAt: new Date(),
      };

      // additions/deletions só entram no update quando temos detalhe fresco — assim
      // um PR que virou merged não tem seu contador zerado num re-sync.
      // Metadados que mudam ao longo da vida do PR (rename de branch, edição de
      // título/URL, vínculo com issue) também são reconciliados no re-sync.
      const set: Partial<typeof review.$inferInsert> = {
         title: row.title,
         status: row.status,
         author: row.author,
         requestedReviewers: row.requestedReviewers,
         targetBranch: row.targetBranch,
         sourceBranch: row.sourceBranch,
         url: row.url,
         resolvesIdentifier: row.resolvesIdentifier,
         resolvesTitle: row.resolvesTitle,
         syncedAt: row.syncedAt,
      };
      if (detail) {
         set.additions = row.additions;
         set.deletions = row.deletions;
      }
      // Checks só entram quando a chamada respondeu (mesmo cuidado dos contadores).
      if (depth?.checks) {
         set.checksPassed = row.checksPassed;
         set.checksTotal = row.checksTotal;
      }

      try {
         await db.insert(review).values(row).onConflictDoUpdate({ target: review.id, set });
         count += 1;
         if (resolvesId)
            links.push({
               identifier: resolvesId,
               prNumber: pr.number,
               title: row.title,
               status: row.status,
            });
         if (depth) await persistPrDepth(db, row.id, depth);
      } catch (e) {
         // Um PR com dado ruim NÃO aborta o sync do repo — loga e segue.
         console.warn(`[circle] review upsert falhou (${row.id}):`, (e as Error).message);
      }
   }

   // Resolve os identifiers → issues reais (batch) e faz upsert dos links (id md5
   // determinístico = idempotente no re-sync). Identifier sem issue correspondente é ignorado.
   await linkPrsToIssues(db, repo, links);
   return count;
}

/** PR que referencia uma issue (identifier), a ser ligado em issue_pr_link. */
interface PrLinkInput {
   identifier: string;
   prNumber: number;
   title: string;
   status: string; // status do review (open|merged|closed)
}

/** Id do link: estável por (issue, repo, PR) — renomear o PR não duplica (Co#18). */
function prLinkId(issueId: string, repo: string, prNumber: number): string {
   return createHash('md5').update(`${issueId}|${repo}#${prNumber}`).digest('hex');
}

/** Id antigo (por título do PR): lido para migrar sem duplicar e sem perder o "já mergeado". */
function legacyPrLinkId(issueId: string, repo: string, title: string): string {
   return createHash('md5').update(`${issueId}|${repo}|${title}`).digest('hex');
}

/**
 * Upsert idempotente de issue_pr_link para os PRs que casam com issues reais.
 *  - A automação `pr.merged` roda só na TRANSIÇÃO do link para merged (#9): re-sync ou
 *    re-entrega do webhook de um PR já mergeado não refecha a issue que alguém reabriu.
 *  - `issue` só é publicado quando o link foi criado ou mudou (título/status).
 */
async function linkPrsToIssues(db: Db, repo: string, links: PrLinkInput[]): Promise<void> {
   if (links.length === 0) return;
   const identifiers = [...new Set(links.map((l) => l.identifier))];
   const [issues, statuses] = await Promise.all([
      db
         .select({
            id: issueT.id,
            identifier: issueT.identifier,
            title: issueT.title,
            statusId: issueT.statusId,
            teamId: issueT.teamId,
         })
         .from(issueT)
         .where(inArray(issueT.identifier, identifiers)),
      db.select().from(statusT),
   ]);
   if (issues.length === 0) return;
   const issueByIdentifier = new Map(issues.map((i) => [i.identifier, i]));
   const catById = new Map(statuses.map((s) => [s.id, s.category]));
   // Status "concluído" alvo do auto-transition (menor position na categoria completed).
   const doneStatus = statuses
      .filter((s) => s.category === 'completed')
      .sort((a, b) => a.position - b.position)[0];

   const pairs = links.flatMap((link) => {
      const iss = issueByIdentifier.get(link.identifier);
      if (!iss) return [];
      return [
         {
            link,
            iss,
            id: prLinkId(iss.id, repo, link.prNumber),
            legacyId: legacyPrLinkId(iss.id, repo, link.title),
         },
      ];
   });
   if (pairs.length === 0) return;
   const existing = await db
      .select()
      .from(issuePrLink)
      .where(inArray(issuePrLink.id, [...new Set(pairs.flatMap((p) => [p.id, p.legacyId]))]));
   const existingById = new Map(existing.map((e) => [e.id, e]));

   for (const { link, iss, id, legacyId } of pairs) {
      const status = prLinkStatus(link.status);
      const current = existingById.get(id);
      const legacy = existingById.get(legacyId);
      const wasMerged = current?.status === 'merged' || legacy?.status === 'merged';
      // PR mergeado → dispara as automações `pr.merged` do time (#97), só na transição.
      if (link.status === 'merged' && !wasMerged && doneStatus) {
         const cat = catById.get(iss.statusId);
         if (cat !== 'completed' && cat !== 'canceled') {
            const applied = await runAutomations(db, 'pr.merged', iss.id, { actorId: null });
            // Feed do canal Slack (best-effort). Gated pelo slack_config.onPrMerged.
            if (applied > 0)
               void notifySlackEvent(db, {
                  type: 'pr.merged',
                  identifier: iss.identifier,
                  title: iss.title,
               });
         }
      }
      const changed =
         !current || current.title !== link.title || current.status !== status || Boolean(legacy);
      try {
         if (changed) {
            await db
               .insert(issuePrLink)
               .values({ id, issueId: iss.id, title: link.title, status })
               .onConflictDoUpdate({ target: issuePrLink.id, set: { title: link.title, status } });
            if (legacy) {
               await db.delete(issuePrLink).where(eq(issuePrLink.id, legacyId));
               existingById.delete(legacyId);
            }
            existingById.set(id, { id, issueId: iss.id, title: link.title, status });
         }
         // resolvesTitle correto: o título da ISSUE do Circle (era o título do PR, enganoso
         // — exibido como "Ticket" no overview). Corrige os reviews deste repo que a resolvem.
         await db
            .update(review)
            .set({ resolvesTitle: iss.title })
            .where(
               and(
                  eq(review.repo, repo),
                  eq(review.resolvesIdentifier, iss.identifier),
                  sql`${review.resolvesTitle} is distinct from ${iss.title}`
               )
            );
         // O painel "PR links" do detalhe da issue mudou (#34) — só quando mudou de fato.
         if (changed)
            publish({ entity: 'issue', action: 'updated', id: iss.id, teamId: iss.teamId });
      } catch (e) {
         console.warn(`[circle] pr-link upsert falhou (${iss.identifier}):`, (e as Error).message);
      }
   }
}

/** Trunca uma string ao limite da coluna (null passa direto). Evita varchar overflow. */
function clip<T extends string | null | undefined>(s: T, max: number): T {
   return s != null && s.length > max ? (s.slice(0, max) as T) : s;
}

/** Payload do evento `pull_request` do webhook do GitHub (subset consumido). */
export interface PullRequestEvent {
   repository?: { full_name?: string };
   pull_request?: GitHubPr;
}

/**
 * Processa um evento `pull_request` do webhook do GitHub em TEMPO REAL: upsert do
 * review + link PR↔issue (com auto-transition PR-merged → Done). Reusa a mesma
 * lógica do sync por polling, mas para UM PR — o payload do webhook já traz
 * additions/deletions (ao contrário da lista /pulls). Retorna o identifier vinculado.
 */
export interface WebhookOptions {
   token?: string;
   fetchImpl?: FetchLike;
   /**
    * Agenda trabalho para DEPOIS da resposta (a rota passa o `after` do Next). Com ele, o
    * ACK do webhook não espera arquivos/commits/checks do PR (Co#19); sem ele, roda inline.
    */
   defer?: (task: () => Promise<void>) => void;
}

export async function handlePullRequestEvent(
   db: Db,
   payload: PullRequestEvent,
   opts: WebhookOptions = {}
): Promise<{ linked: string | null; stale?: boolean }> {
   const repoFull = payload.repository?.full_name;
   const pr = payload.pull_request;
   if (!repoFull || !pr) return { linked: null };
   const repo = clip(repoFull, 196) as string;
   const candidates = resolveCandidates(pr.title, pr.head?.ref, pr.body);
   const existing = await existingIdentifiers(db, candidates);
   const resolvesId = candidates.find((id) => existing.has(id)) ?? null;
   const status = statusOf(pr);
   const title = clip(pr.title, 512) as string;
   // `syncedAt` guarda "estado do PR conhecido até": o `updated_at` do GitHub no webhook,
   // o relógio do sync no polling (que lê o estado atual). Entrega com `updated_at`
   // anterior ao gravado é velha — o GitHub não garante ordem — e não sobrescreve (Co#19).
   const updatedAt = pr.updated_at ? new Date(pr.updated_at) : null;
   const version = updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : new Date();
   const row = {
      id: `${repo}#${pr.number}`,
      title,
      status,
      repo,
      prNumber: pr.number,
      url: clip(pr.html_url ?? null, 512),
      author: clip(pr.user?.login ?? null, 128),
      requestedReviewers: reviewersCsv(pr),
      targetBranch: clip(pr.base?.ref ?? null, 196),
      sourceBranch: clip(pr.head?.ref ?? null, 196),
      additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0,
      resolvesIdentifier: resolvesId,
      resolvesTitle: resolvesId ? title : null,
      checksPassed: 0,
      checksTotal: 0,
      createdAt: new Date(pr.created_at),
      syncedAt: version,
   };
   const set: Partial<typeof review.$inferInsert> = {
      title: row.title,
      status: row.status,
      author: row.author,
      requestedReviewers: row.requestedReviewers,
      targetBranch: row.targetBranch,
      sourceBranch: row.sourceBranch,
      url: row.url,
      resolvesIdentifier: row.resolvesIdentifier,
      resolvesTitle: row.resolvesTitle,
      syncedAt: row.syncedAt,
   };
   // additions/deletions só entram no update quando o payload os traz (evita zerar
   // o contador de um PR que já tinha detalhe — mesmo cuidado do sync por polling).
   if (pr.additions != null || pr.deletions != null) {
      set.additions = row.additions;
      set.deletions = row.deletions;
   }
   const written = await db
      .insert(review)
      .values(row)
      .onConflictDoUpdate({
         target: review.id,
         set,
         setWhere: sql`${review.syncedAt} <= ${version.toISOString()}`,
      })
      .returning({ id: review.id });
   if (written.length === 0) return { linked: null, stale: true };
   if (resolvesId) {
      await linkPrsToIssues(db, repo, [
         { identifier: resolvesId, prNumber: pr.number, title, status },
      ]);
   }
   // Arquivos/commits/checks do PR aberto, quando há token (best-effort — o ACK do
   // webhook não depende disso).
   const token = opts.token ?? process.env.GITHUB_TOKEN;
   const doFetch = opts.fetchImpl ?? fetch;
   if (status === 'open' && token) {
      const refreshDepth = async () => {
         try {
            const depth = await fetchPrDepth(repo, pr, token, doFetch);
            if (depth.checks) {
               await db
                  .update(review)
                  .set({ checksPassed: depth.checks.passed, checksTotal: depth.checks.total })
                  .where(eq(review.id, row.id));
            }
            await persistPrDepth(db, row.id, depth);
         } catch (e) {
            console.warn(`[circle] profundidade do PR falhou (${row.id}):`, (e as Error).message);
         }
      };
      if (opts.defer) {
         // Responde já com o PR gravado; a profundidade chega num segundo evento.
         publish({ entity: 'review', action: 'updated', id: row.id });
         opts.defer(async () => {
            await refreshDepth();
            publish({ entity: 'review', action: 'updated', id: row.id });
         });
         return { linked: resolvesId };
      }
      await refreshDepth();
   }
   // Só depois de gravar checks/arquivos (#34): antes o cliente recarregava no meio e
   // via o PR sem eles.
   publish({ entity: 'review', action: 'updated', id: row.id });
   return { linked: resolvesId };
}

/** Payload dos eventos `check_run`/`check_suite` do webhook (subset consumido). */
export interface CheckRunEvent {
   repository?: { full_name?: string };
   check_run?: { head_sha?: string; pull_requests?: { number: number }[] };
   check_suite?: { head_sha?: string; pull_requests?: { number: number }[] };
}

/**
 * Recalcula `checksPassed/checksTotal` dos PRs que o evento lista (só os que já são
 * review no Circle). Uma chamada ao check-runs do head_sha serve para todos eles.
 */
export async function handleCheckRunEvent(
   db: Db,
   payload: CheckRunEvent,
   opts: WebhookOptions = {}
): Promise<{ updated: string[] }> {
   const repoFull = payload.repository?.full_name;
   const run = payload.check_run ?? payload.check_suite;
   const token = opts.token ?? process.env.GITHUB_TOKEN;
   if (!repoFull || !run?.head_sha || !token) return { updated: [] };
   const repo = clip(repoFull, 196) as string;
   const ids = (run.pull_requests ?? [])
      .map((p) => p?.number)
      .filter((n): n is number => Number.isInteger(n))
      .map((n) => `${repo}#${n}`);
   if (ids.length === 0) return { updated: [] };
   const existing = await db.select({ id: review.id }).from(review).where(inArray(review.id, ids));
   if (existing.length === 0) return { updated: [] };
   const checks = await fetchPrChecks(repo, run.head_sha, token, opts.fetchImpl ?? fetch);
   if (!checks) return { updated: [] };
   const updated = existing.map((e) => e.id);
   await db
      .update(review)
      // Sem mexer em `syncedAt`: ele versiona o estado do PR (Co#19), não os checks.
      .set({ checksPassed: checks.passed, checksTotal: checks.total })
      .where(inArray(review.id, updated));
   // Checks mudaram: a lista e o detalhe abertos atualizam (#34).
   for (const id of updated) publish({ entity: 'review', action: 'updated', id });
   return { updated };
}
