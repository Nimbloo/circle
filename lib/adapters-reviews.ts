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
import type { Review, ReviewStatus } from '@/data/reviews';
import type { ReviewDto } from '@/lib/api/reviews';
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

/**
 * ReviewDto (backend, PR cru) -> Review (tipo rico da UI). Os campos de detalhe
 * que o backend não expõe saem vazios; `list` é neutro ('for-you') porque o
 * backend não modela a distinção For you / Created.
 */
export function adaptReview(dto: ReviewDto): Review {
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
      files: [],
      commits: [],
      summary: [],
      testPlan: [],
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
   opts: { limit?: number; offset?: number } = {}
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

/** POST /reviews/sync — dispara a ingestão de PRs do GitHub (roda em background no servidor). */
export async function syncReviews(): Promise<void> {
   await api.reviews.sync();
}
