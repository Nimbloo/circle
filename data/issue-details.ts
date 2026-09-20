import { User } from './users';
import type { EditorDoc } from '@/lib/editor-doc';
import type { SubIssueRef } from '@/lib/api/issue-detail';

/* -------------------------------------------------------------------------- */
/*                         Rich content block model                           */
/* -------------------------------------------------------------------------- */

/**
 * Structured description content. Text supports lightweight inline
 * formatting: `code` and **bold** (parsed by the block renderer).
 */
export type ContentBlock =
   | { type: 'heading'; text: string; level?: 1 | 2 }
   | { type: 'paragraph'; text: string }
   | { type: 'bullet-list'; items: string[] }
   | { type: 'numbered-list'; items: string[] }
   | { type: 'checklist'; items: { text: string; checked: boolean }[] }
   | { type: 'code'; language: string; code: string }
   | { type: 'image'; alt: string; caption?: string; aspect?: 'wide' | 'video' | 'square' }
   | { type: 'video'; title: string; duration?: string }
   | { type: 'quote'; text: string; author?: string }
   | { type: 'divider' }
   | { type: 'issue-ref'; identifier: string; note?: string };

export interface CommentReaction {
   emoji: string;
   count: number;
   reactedByMe?: boolean;
}

/** Anexo de issue ou de comentário (arquivo no S3/CDN; metadados no banco). */
export interface Attachment {
   id: string;
   url: string;
   fileName: string;
   contentType: string;
   size: number;
   /** null = anexo da issue; senão, do comentário. */
   commentId: string | null;
   uploadedById: string | null;
   createdAt: string;
}

export type ActivityItem =
   | {
        kind: 'event';
        id: string;
        actor: User;
        /** e.g. 'created' | 'status' | 'label' | 'priority' | 'cycle' | 'blocked' | 'unblocked' | 'related' | 'pr' */
        event: string;
        text: string;
        timeAgo: string;
     }
   | {
        kind: 'comment';
        id: string;
        actor: User;
        timeAgo: string;
        body: ContentBlock[];
        /** Comentário-pai (threading). undefined/null = raiz. */
        parentId?: string | null;
        /** Última edição (ISO); a UI mostra "edited" quando existe. */
        updatedAt?: string | null;
        /** Thread resolvida (só na raiz). */
        resolvedAt?: string | null;
        resolvedBy?: User | null;
        reactions?: CommentReaction[];
        attachments?: Attachment[];
     };

export interface PrLink {
   id: string;
   title: string;
   status: 'open' | 'merged' | 'draft';
}

export interface IssueDetail {
   identifier: string;
   description: ContentBlock[];
   /** Doc do editor de blocos; null = derivar de `description` (`blocksToDoc`). */
   descriptionDoc?: EditorDoc | null;
   activity: ActivityItem[];
   /** Pai canônico (#95) — alimenta o breadcrumb e a propriedade Parent. */
   parent?: { id: string; identifier: string; title: string } | null;
   /** Filhas diretas resolvidas pelo servidor (a UI não cruza com o issues-store). */
   subIssues?: SubIssueRef[];
   subIssueIds?: string[];
   relatedIds?: string[];
   blockedByIds?: string[];
   blockingIds?: string[];
   duplicateIds?: string[];
   prLinks?: PrLink[];
   /** Anexos da issue (os de comentário vêm em cada comentário do feed). */
   attachments?: Attachment[];
   /** Milestone livre (legado). Novo fluxo usa milestoneId/milestoneName estruturados. */
   milestone?: string;
   milestoneId?: string | null;
   milestoneName?: string | null;
}
