/**
 * Export JSON de issues (#101). O CSV (`app/api/v1/issues/export`) é achatado e serve a
 * planilha; o JSON preserva a estrutura — labels, todos os responsáveis, pai e comentários —
 * para backup e migração de volta.
 */
import { asc, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser, comment as commentT, issueContent } from '@/db/schema';
import { listIssues, type IssueListOptions, type UserRef } from './issues';

export interface ExportedComment {
   id: string;
   author: UserRef | null;
   body: string;
   parentId: string | null;
   createdAt: string;
}

export interface ExportedIssue {
   id: string;
   identifier: string;
   teamId: string;
   title: string;
   description: string | null;
   status: { id: string; name: string; category: string };
   priority: { id: string; name: string };
   assignees: UserRef[];
   labels: { id: string; name: string; color: string }[];
   project: { id: string; name: string } | null;
   parent: { id: string; identifier: string } | null;
   estimate: number | null;
   dueDate: string | null;
   createdAt: string;
   updatedAt: string;
   comments: ExportedComment[];
}

export interface ExportBundle {
   /** Versão do formato — um importador futuro sabe o que espera. */
   version: 1;
   exportedAt: string;
   count: number;
   issues: ExportedIssue[];
}

const iso = (v: Date | string | null): string =>
   v instanceof Date ? v.toISOString() : (v ?? '').toString();

/** Monta o bundle JSON das issues que casam com os filtros (mesmos da listagem/CSV). */
export async function exportIssuesJson(db: Db, opts: IssueListOptions = {}): Promise<ExportBundle> {
   const issues = await listIssues(db, { limit: 5000, ...opts });
   const ids = issues.map((i) => i.id);

   const [descriptions, comments] = await Promise.all([
      ids.length
         ? db
              .select({ issueId: issueContent.issueId, description: issueContent.description })
              .from(issueContent)
              .where(inArray(issueContent.issueId, ids))
         : Promise.resolve([]),
      ids.length
         ? db
              .select()
              .from(commentT)
              .where(inArray(commentT.issueId, ids))
              .orderBy(asc(commentT.createdAt))
         : Promise.resolve([]),
   ]);

   const authorIds = [...new Set(comments.map((c) => c.authorId))];
   const authors = authorIds.length
      ? await db.select().from(appUser).where(inArray(appUser.id, authorIds))
      : [];
   const authorById = new Map(authors.map((u) => [u.id, u]));
   const descById = new Map(descriptions.map((d) => [d.issueId, d.description]));

   const commentsByIssue = new Map<string, ExportedComment[]>();
   for (const c of comments) {
      const u = authorById.get(c.authorId);
      const list = commentsByIssue.get(c.issueId) ?? [];
      list.push({
         id: c.id,
         author: u
            ? { id: u.id, slug: u.slug, name: u.name, email: u.email, avatarUrl: u.avatarUrl }
            : null,
         body: c.body,
         parentId: c.parentId,
         createdAt: iso(c.createdAt),
      });
      commentsByIssue.set(c.issueId, list);
   }

   return {
      version: 1,
      exportedAt: new Date().toISOString(),
      count: issues.length,
      issues: issues.map((i) => ({
         id: i.id,
         identifier: i.identifier,
         teamId: i.teamId,
         title: i.title,
         description: descById.get(i.id) ?? null,
         status: { id: i.status.id, name: i.status.name, category: i.status.category },
         priority: { id: i.priority.id, name: i.priority.name },
         assignees: i.assignees,
         labels: i.labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
         project: i.project ? { id: i.project.id, name: i.project.name } : null,
         parent:
            i.parentId && i.parentIdentifier
               ? { id: i.parentId, identifier: i.parentIdentifier }
               : null,
         estimate: i.estimate,
         dueDate: i.dueDate,
         createdAt: i.createdAt,
         updatedAt: i.updatedAt,
         comments: commentsByIssue.get(i.id) ?? [],
      })),
   };
}
