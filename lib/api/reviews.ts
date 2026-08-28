import { createHash } from 'node:crypto';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { review, issue as issueT, issuePrLink, status as statusT } from '@/db/schema';
import { ApiError } from './errors';
import { notifySlackEvent } from './integrations/slack';

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

function toDto(r: ReviewRow): ReviewDto {
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
   limit?: number;
   offset?: number;
}

export interface ReviewPage {
   items: ReviewDto[];
   total: number;
}

/**
 * Lista PRs sincronizados, paginado (limit/offset, default limit=50) + total do
 * conjunto (respeitando o filtro de status), pra a UI mostrar "X de Y" e o load-more.
 */
export async function listReviews(db: Db, opts: ListReviewsOptions = {}): Promise<ReviewPage> {
   const limit = opts.limit ?? 50;
   const offset = opts.offset ?? 0;
   const where = opts.status ? eq(review.status, opts.status) : undefined;

   const rows = where
      ? await db
           .select()
           .from(review)
           .where(where)
           .orderBy(desc(review.createdAt))
           .limit(limit)
           .offset(offset)
      : await db.select().from(review).orderBy(desc(review.createdAt)).limit(limit).offset(offset);

   const countRows = where
      ? await db.select({ c: count() }).from(review).where(where)
      : await db.select({ c: count() }).from(review);
   const total = Number(countRows[0]?.c ?? 0);

   return { items: rows.map(toDto), total };
}

export async function getReview(db: Db, id: string): Promise<ReviewDto | null> {
   const rows = await db.select().from(review).where(eq(review.id, id)).limit(1);
   return rows.length ? toDto(rows[0]) : null;
}

// ── Ingestão do GitHub ────────────────────────────────────────────
interface GitHubPr {
   number: number;
   title: string;
   state: string; // open|closed
   merged_at: string | null;
   html_url: string;
   created_at: string;
   user?: { login: string };
   body?: string | null;
   base?: { ref: string };
   head?: { ref: string };
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
const DETAIL_CONCURRENCY = 8;

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

/** Extrai o identifier da issue resolvida (ex "LNUI-701") do título, branch OU corpo do PR
 * (paridade Linear: reconhece o id no título, no nome do branch e na descrição). */
function parseResolves(...sources: (string | null | undefined)[]): string | null {
   for (const s of sources) {
      if (!s) continue;
      // case-insensitive: branches usam minúsculo (core-42-...). Ids inexistentes são
      // ignorados depois (linkPrsToIssues valida contra issues reais), então sem risco.
      const m = s.match(/\b([A-Za-z]{2,}-\d+)\b/);
      if (m) return m[1].toUpperCase();
   }
   return null;
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
   for (let i = 0; i < openPrs.length; i += DETAIL_CONCURRENCY) {
      const batch = openPrs.slice(i, i + DETAIL_CONCURRENCY);
      const details = await Promise.all(
         batch.map((pr) => fetchPrDetail(repo, pr.number, token, doFetch))
      );
      batch.forEach((pr, idx) => {
         const d = details[idx];
         if (d) detailByNumber.set(pr.number, d);
      });
   }

   let count = 0;
   // Auto-link PR↔issue (paridade Linear): PRs cujo título referencia um identifier
   // (ex.: CORE-123) viram linha em issue_pr_link, populando o painel "PR links" da
   // issue. Coletado no loop e resolvido em batch no fim (1 query por identifier set).
   const linkByIdentifier = new Map<string, { title: string; status: string }>();
   for (const pr of prs) {
      const resolvesId = parseResolves(pr.title, pr.head?.ref, pr.body);
      const detail = detailByNumber.get(pr.number);
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
         targetBranch: clip(pr.base?.ref ?? null, 196),
         sourceBranch: clip(pr.head?.ref ?? null, 196),
         additions: detail?.additions ?? pr.additions ?? 0,
         deletions: detail?.deletions ?? pr.deletions ?? 0,
         resolvesIdentifier: resolvesId,
         resolvesTitle: resolvesId ? clip(pr.title, 512) : null,
         checksPassed: 0,
         checksTotal: 0,
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

      try {
         await db.insert(review).values(row).onConflictDoUpdate({ target: review.id, set });
         count += 1;
         if (resolvesId) linkByIdentifier.set(resolvesId, { title: row.title, status: row.status });
      } catch (e) {
         // Um PR com dado ruim NÃO aborta o sync do repo — loga e segue.
         console.warn(`[circle] review upsert falhou (${row.id}):`, (e as Error).message);
      }
   }

   // Resolve os identifiers → issues reais (batch) e faz upsert dos links (id md5
   // determinístico = idempotente no re-sync). Identifier sem issue correspondente é ignorado.
   await linkPrsToIssues(db, repo, linkByIdentifier);
   return count;
}

/** Upsert idempotente de issue_pr_link para os identifiers que casam com issues reais. */
async function linkPrsToIssues(
   db: Db,
   repo: string,
   linkByIdentifier: Map<string, { title: string; status: string }>
): Promise<void> {
   if (linkByIdentifier.size === 0) return;
   const identifiers = [...linkByIdentifier.keys()];
   const [issues, statuses] = await Promise.all([
      db
         .select({
            id: issueT.id,
            identifier: issueT.identifier,
            title: issueT.title,
            statusId: issueT.statusId,
         })
         .from(issueT)
         .where(inArray(issueT.identifier, identifiers)),
      db.select().from(statusT),
   ]);
   const catById = new Map(statuses.map((s) => [s.id, s.category]));
   // Status "concluído" alvo do auto-transition (menor position na categoria completed).
   const doneStatus = statuses
      .filter((s) => s.category === 'completed')
      .sort((a, b) => a.position - b.position)[0];
   for (const iss of issues) {
      const link = linkByIdentifier.get(iss.identifier);
      if (!link) continue;
      // PR mergeado → move a issue pra Done (paridade Linear), a menos que já esteja
      // completed/canceled (idempotente; não sobrescreve estados finais nem re-dispara).
      if (link.status === 'merged' && doneStatus) {
         const cat = catById.get(iss.statusId);
         if (cat !== 'completed' && cat !== 'canceled') {
            await db
               .update(issueT)
               .set({ statusId: doneStatus.id, updatedAt: new Date() })
               .where(eq(issueT.id, iss.id));
            // Feed do canal Slack (best-effort). Gated pelo slack_config.onPrMerged.
            void notifySlackEvent(db, {
               type: 'pr.merged',
               identifier: iss.identifier,
               title: iss.title,
            });
         }
      }
      // id estável por (issue, repo, PR-título-normalizado) → re-sync atualiza, não duplica.
      const id = createHash('md5').update(`${iss.id}|${repo}|${link.title}`).digest('hex');
      try {
         await db
            .insert(issuePrLink)
            .values({ id, issueId: iss.id, title: link.title, status: prLinkStatus(link.status) })
            .onConflictDoUpdate({
               target: issuePrLink.id,
               set: { title: link.title, status: prLinkStatus(link.status) },
            });
         // resolvesTitle correto: o título da ISSUE do Circle (era o título do PR, enganoso
         // — exibido como "Ticket" no overview). Corrige os reviews deste repo que a resolvem.
         await db
            .update(review)
            .set({ resolvesTitle: iss.title })
            .where(and(eq(review.repo, repo), eq(review.resolvesIdentifier, iss.identifier)));
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
export async function handlePullRequestEvent(
   db: Db,
   payload: PullRequestEvent
): Promise<{ linked: string | null }> {
   const repoFull = payload.repository?.full_name;
   const pr = payload.pull_request;
   if (!repoFull || !pr) return { linked: null };
   const repo = clip(repoFull, 196) as string;
   const resolvesId = parseResolves(pr.title, pr.head?.ref, pr.body);
   const status = statusOf(pr);
   const title = clip(pr.title, 512) as string;
   const row = {
      id: `${repo}#${pr.number}`,
      title,
      status,
      repo,
      prNumber: pr.number,
      url: clip(pr.html_url ?? null, 512),
      author: clip(pr.user?.login ?? null, 128),
      targetBranch: clip(pr.base?.ref ?? null, 196),
      sourceBranch: clip(pr.head?.ref ?? null, 196),
      additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0,
      resolvesIdentifier: resolvesId,
      resolvesTitle: resolvesId ? title : null,
      checksPassed: 0,
      checksTotal: 0,
      createdAt: new Date(pr.created_at),
      syncedAt: new Date(),
   };
   const set: Partial<typeof review.$inferInsert> = {
      title: row.title,
      status: row.status,
      author: row.author,
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
   await db.insert(review).values(row).onConflictDoUpdate({ target: review.id, set });
   if (resolvesId) {
      await linkPrsToIssues(db, repo, new Map([[resolvesId, { title, status }]]));
   }
   return { linked: resolvesId };
}
