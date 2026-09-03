/**
 * Tipos de domínio da feature Reviews (PR reviews estilo Linear/GitHub): abas da
 * lista ("For you" / "Created") e o conteúdo de Overview / Guide / Diff de cada review.
 * Os dados vêm do backend (`lib/api/reviews.ts`) via `lib/adapters-reviews.ts`; não há
 * mock nem gerador aqui.
 */

export type ReviewStatus = 'open' | 'merged' | 'closed';
export type ReviewList = 'for-you' | 'created';

export type ReviewFileCategory = 'implementation' | 'tests';

export interface ReviewFileStat {
   name: string;
   path: string;
   additions: number;
   deletions: number;
   category: ReviewFileCategory;
   /** added|modified|removed|renamed (só para arquivos vindos do GitHub). */
   status?: string;
   /** Unified diff do GitHub; null/ausente quando o arquivo é binário ou grande. */
   patch?: string | null;
}

export interface ReviewCommit {
   sha: string;
   message: string;
   timeAgo: string;
}

export interface DiffLine {
   type: 'context' | 'add' | 'del' | 'skip';
   /** New-file line number (omitted for del/skip). */
   number?: number;
   text?: string;
   /** For 'skip': how many unchanged lines are collapsed. */
   count?: number;
}

export interface FileDiff {
   name: string;
   path: string;
   additions: number;
   deletions: number;
   lines: DiffLine[];
}

export interface GuideSection {
   title: string;
   paragraphs: string[];
   /** File name shown as chips under the prose (stat = "+n -m"). */
   fileRefs: { name: string; path: string; stat: string }[];
   /** Which file diff to show next to the section. */
   diffName: string;
}

/** Guide gerado a partir do diff (persistido no backend). */
export interface ReviewGuide {
   sections: GuideSection[];
   generatedAt: string;
   model: string;
}

export type ReviewCommentKind = 'comment' | 'approve' | 'request_changes';
export type ReviewVerdictKind = Exclude<ReviewCommentKind, 'comment'>;

export interface ReviewCommentAuthor {
   id: string;
   name: string;
   avatarUrl: string | null;
}

/** Comentário da thread do review: geral, por arquivo (`path`) ou por linha (`path` + `line`). */
export interface ReviewComment {
   id: string;
   author: ReviewCommentAuthor | null;
   path: string | null;
   /** Linha do arquivo NOVO no diff; null = comentário do arquivo inteiro. */
   line: number | null;
   kind: ReviewCommentKind;
   body: string;
   createdAt: string;
   timeAgo: string;
}

/** Último veredito registrado na thread (Approved / Changes requested). */
export interface ReviewVerdict {
   kind: ReviewVerdictKind;
   author: ReviewCommentAuthor | null;
   createdAt: string;
   timeAgo: string;
}

export interface Review {
   /** URL slug. */
   id: string;
   title: string;
   status: ReviewStatus;
   list: ReviewList;
   timeAgo: string;
   repo: string;
   prNumber: number;
   targetBranch: string;
   sourceBranch: string;
   additions: number;
   deletions: number;
   /** Issue this PR resolves (real identifier from mock-data/issues.ts). */
   resolves: { identifier: string; title: string };
   checksPassed: number;
   checksTotal: number;
   files: ReviewFileStat[];
   commits: ReviewCommit[];
   /** Description "Summary" bullets — `inline code` supported via backticks. */
   summary: string[];
   testPlan: { text: string; checked: boolean }[];
   deployment?: { project: string; state: string; action: string };
   /** Thread de comentários (só vem no detalhe; na lista sai vazia). */
   comments: ReviewComment[];
   /** Veredito corrente — último `approve`/`request_changes` da thread; null sem veredito. */
   verdict: ReviewVerdict | null;
   /** Guide gerado; `null` quando ainda não foi gerado (só vem no detalhe). */
   guide?: ReviewGuide | null;
}
