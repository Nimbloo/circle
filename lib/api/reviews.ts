import { desc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { review } from '@/db/schema';
import { ApiError } from './errors';

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

export async function listReviews(db: Db, opts: { status?: string } = {}): Promise<ReviewDto[]> {
   const rows = opts.status
      ? await db
           .select()
           .from(review)
           .where(eq(review.status, opts.status))
           .orderBy(desc(review.createdAt))
      : await db.select().from(review).orderBy(desc(review.createdAt));
   return rows.map(toDto);
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
   base?: { ref: string };
   head?: { ref: string };
   additions?: number;
   deletions?: number;
}

type FetchLike = typeof fetch;

function statusOf(pr: GitHubPr): string {
   if (pr.merged_at) return 'merged';
   if (pr.state === 'closed') return 'closed';
   return 'open';
}

/** Extrai o identifier da issue resolvida (ex "[LNUI-701] ...") do título. */
function parseResolves(title: string): string | null {
   const m = title.match(/\b([A-Z]{2,}-\d+)\b/);
   return m ? m[1] : null;
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

   let count = 0;
   for (const repo of repos) {
      const res = await doFetch(
         `https://api.github.com/repos/${repo}/pulls?state=all&per_page=50`,
         {
            headers: {
               'authorization': `Bearer ${token}`,
               'accept': 'application/vnd.github+json',
               'user-agent': 'circle-nimbloo',
            },
         }
      );
      if (!res.ok) continue;
      const prs = (await res.json()) as GitHubPr[];
      if (!Array.isArray(prs) || prs.length === 0) continue;

      const rows = prs.map((pr) => {
         const resolvesId = parseResolves(pr.title);
         return {
            id: `${repo}#${pr.number}`,
            title: pr.title,
            status: statusOf(pr),
            repo,
            prNumber: pr.number,
            url: pr.html_url ?? null,
            author: pr.user?.login ?? null,
            targetBranch: pr.base?.ref ?? null,
            sourceBranch: pr.head?.ref ?? null,
            additions: pr.additions ?? 0,
            deletions: pr.deletions ?? 0,
            resolvesIdentifier: resolvesId,
            resolvesTitle: resolvesId ? pr.title : null,
            checksPassed: 0,
            checksTotal: 0,
            createdAt: new Date(pr.created_at),
            syncedAt: new Date(),
         };
      });

      for (const row of rows) {
         await db
            .insert(review)
            .values(row)
            .onConflictDoUpdate({
               target: review.id,
               set: {
                  title: row.title,
                  status: row.status,
                  additions: row.additions,
                  deletions: row.deletions,
                  syncedAt: row.syncedAt,
               },
            });
         count += 1;
      }
   }
   return count;
}
