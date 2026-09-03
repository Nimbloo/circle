/**
 * Adapters + fetchers da feature Reviews (code review estilo GitHub).
 *
 * O backend guarda o PR "cru" sincronizado do GitHub (título, status, branches,
 * contadores) via `ReviewDto`. A UI usa o tipo rico `Review` do mock, que tem
 * campos de DETALHE (files/commits/summary/testPlan/deployment/reviewNote) que o
 * backend AINDA não modela — esses saem VAZIOS. Nada é inventado: sem dado no
 * contrato, os componentes degradam pra estado vazio.
 *
 * Os fetchers usam o cliente tipado global (`api.reviews`, em lib/client.ts).
 */
import type {
   Review,
   ReviewCommit,
   ReviewFileStat,
   ReviewGuide,
   ReviewStatus,
} from '@/data/reviews';
import type { ReviewCommitDto, ReviewDetailDto, ReviewDto, ReviewFileDto } from '@/lib/api/reviews';
import { api, ApiError } from '@/lib/client';

const VALID_STATUS: readonly ReviewStatus[] = ['open', 'merged', 'closed'];

function toStatus(raw: string): ReviewStatus {
   return (VALID_STATUS as readonly string[]).includes(raw) ? (raw as ReviewStatus) : 'open';
}

/** Tempo relativo compacto ("2h", "1d", "3w") a partir de um ISO. */
function relativeTime(iso: string): string {
   const then = new Date(iso).getTime();
   if (Number.isNaN(then)) return '';
   const diff = Math.max(0, Date.now() - then);
   const min = Math.floor(diff / 60000);
   if (min < 1) return 'now';
   if (min < 60) return `${min}m`;
   const hours = Math.floor(min / 60);
   if (hours < 24) return `${hours}h`;
   const days = Math.floor(hours / 24);
   if (days < 7) return `${days}d`;
   return `${Math.floor(days / 7)}w`;
}

const TEST_PATH = /(^|\/)(__tests__|tests?|spec)(\/|$)|\.(test|spec)\.[^/]+$/;

/** `src/app/x.ts` → name `x.ts`, path `src/app` (a UI mostra nome e diretório separados). */
export function splitFilePath(full: string): { name: string; path: string } {
   const idx = full.lastIndexOf('/');
   return idx === -1
      ? { name: full, path: '' }
      : { name: full.slice(idx + 1), path: full.slice(0, idx) };
}

export function adaptReviewFile(file: ReviewFileDto): ReviewFileStat {
   return {
      ...splitFilePath(file.path),
      additions: file.additions,
      deletions: file.deletions,
      category: TEST_PATH.test(file.path) ? 'tests' : 'implementation',
      status: file.status,
      patch: file.patch,
   };
}

export function adaptReviewCommit(commit: ReviewCommitDto): ReviewCommit {
   return {
      sha: commit.sha.slice(0, 7),
      message: commit.message.split('\n')[0],
      timeAgo: commit.committedAt ? relativeTime(commit.committedAt) : '',
   };
}

/**
 * ReviewDto (backend, PR cru) -> Review (tipo rico da UI). Arquivos, commits e guide só
 * vêm no detalhe (`ReviewDetailDto`); na lista saem vazios. `summary`/`testPlan` seguem
 * vazios (sem fonte de dados) e `list` é neutro ('for-you').
 */
export function adaptReview(dto: ReviewDto | ReviewDetailDto): Review {
   const files = 'files' in dto ? dto.files.map(adaptReviewFile) : [];
   const commits = 'commits' in dto ? dto.commits.map(adaptReviewCommit) : [];
   const guide = 'guide' in dto ? dto.guide : null;
   return {
      id: dto.id,
      title: dto.title,
      status: toStatus(dto.status),
      list: 'for-you',
      timeAgo: relativeTime(dto.createdAt),
      repo: dto.repo,
      prNumber: dto.prNumber,
      targetBranch: dto.targetBranch ?? '',
      sourceBranch: dto.sourceBranch ?? '',
      additions: dto.additions,
      deletions: dto.deletions,
      resolves: dto.resolves ?? { identifier: '', title: '' },
      checksPassed: dto.checksPassed,
      checksTotal: dto.checksTotal,
      files,
      commits,
      summary: [],
      testPlan: [],
      guide,
   };
}

export function adaptReviews(dtos: ReviewDto[]): Review[] {
   return dtos.map(adaptReview);
}

/* -------------------------------------------------------------------------- */
/*                                  Fetchers                                  */
/* -------------------------------------------------------------------------- */

export interface ReviewsPage {
   reviews: Review[];
   total: number;
   limit: number;
   offset: number;
}

/**
 * GET /reviews — página de PRs sincronizados (limit/offset, default limit=50),
 * já adaptados pra `Review`, mais o total do conjunto (pra o load-more/"X de Y").
 */
export async function fetchReviews(
   opts: { limit?: number; offset?: number; list?: 'created' | 'for-you' } = {}
): Promise<ReviewsPage> {
   const { items, total, limit, offset } = await api.reviews.list(opts);
   return { reviews: adaptReviews(items), total, limit, offset };
}

/** GET /reviews/{id} — detalhe de um review, ou `null` se não existir (404). */
export async function fetchReview(id: string): Promise<Review | null> {
   try {
      return adaptReview(await api.reviews.get(id));
   } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
   }
}

/** POST /reviews/{id}/guide — gera (ou regenera) o guide a partir do diff e o devolve. */
export async function generateReviewGuide(id: string): Promise<ReviewGuide> {
   return api.reviews.generateGuide(id);
}

/** POST /reviews/sync — dispara a ingestão de PRs do GitHub (roda em background no servidor). */
export async function syncReviews(): Promise<void> {
   await api.reviews.sync();
}
