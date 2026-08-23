import { randomUUID } from 'node:crypto';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   status as statusT,
   issue as issueT,
   project as projectT,
   issueTemplate as tmplT,
} from '@/db/schema';
import { ApiError } from './errors';

export const STATUS_CATEGORIES = [
   'triage',
   'backlog',
   'unstarted',
   'started',
   'completed',
   'canceled',
] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export interface StatusDto {
   id: string;
   name: string;
   color: string;
   category: string;
   position: number;
}

type StatusRow = typeof statusT.$inferSelect;
const toDto = (r: StatusRow): StatusDto => ({
   id: r.id,
   name: r.name,
   color: r.color,
   category: r.category,
   position: r.position,
});

export async function getStatus(db: Db, id: string): Promise<StatusDto | null> {
   const [row] = await db.select().from(statusT).where(eq(statusT.id, id)).limit(1);
   return row ? toDto(row) : null;
}

export interface CreateStatusInput {
   name: string;
   color: string;
   category: string;
}

export async function createStatus(db: Db, input: CreateStatusInput): Promise<StatusDto> {
   if (!STATUS_CATEGORIES.includes(input.category as StatusCategory))
      throw new ApiError(400, `Categoria inválida: use ${STATUS_CATEGORIES.join('|')}`);
   if (!input.name.trim()) throw new ApiError(400, 'Nome do status é obrigatório');

   const id = randomUUID();
   const [max] = await db.select({ m: sql<number | null>`max(${statusT.position})` }).from(statusT);
   const position = (Number(max?.m) || 0) + 1;
   await db.insert(statusT).values({
      id,
      name: input.name.trim(),
      color: input.color,
      category: input.category,
      position,
   });
   return (await getStatus(db, id))!;
}

export interface UpdateStatusInput {
   name?: string;
   color?: string;
   category?: string;
}

export async function updateStatus(
   db: Db,
   id: string,
   patch: UpdateStatusInput
): Promise<StatusDto | null> {
   const existing = await getStatus(db, id);
   if (!existing) return null;
   const values: Partial<StatusRow> = {};
   if (patch.name !== undefined) values.name = patch.name.trim();
   if (patch.color !== undefined) values.color = patch.color;
   if (patch.category !== undefined) {
      if (!STATUS_CATEGORIES.includes(patch.category as StatusCategory))
         throw new ApiError(400, `Categoria inválida: use ${STATUS_CATEGORIES.join('|')}`);
      values.category = patch.category;
   }
   if (Object.keys(values).length > 0)
      await db.update(statusT).set(values).where(eq(statusT.id, id));
   return getStatus(db, id);
}

/**
 * Exclui um status. BLOQUEIA (409) se estiver em uso por qualquer issue, projeto
 * ou template — a FK quebraria e dados ficariam órfãos. Reatribua antes.
 */
export async function deleteStatus(db: Db, id: string): Promise<boolean> {
   const existing = await getStatus(db, id);
   if (!existing) return false;

   const [inIssue] = await db
      .select({ id: issueT.id })
      .from(issueT)
      .where(eq(issueT.statusId, id))
      .limit(1);
   const [inProject] = await db
      .select({ id: projectT.id })
      .from(projectT)
      .where(eq(projectT.statusId, id))
      .limit(1);
   const [inTmpl] = await db
      .select({ id: tmplT.id })
      .from(tmplT)
      .where(eq(tmplT.statusId, id))
      .limit(1);
   if (inIssue || inProject || inTmpl)
      throw new ApiError(409, 'Status em uso — reatribua as issues/projetos antes de excluir.');

   await db.delete(statusT).where(eq(statusT.id, id));
   return true;
}

/** Reordena os status na ordem dos ids fornecidos (position = índice). */
export async function reorderStatuses(db: Db, ids: string[]): Promise<StatusDto[]> {
   await Promise.all(
      ids.map((id, i) => db.update(statusT).set({ position: i }).where(eq(statusT.id, id)))
   );
   const rows = await db
      .select()
      .from(statusT)
      .where(inArray(statusT.id, ids.length ? ids : ['']))
      .orderBy(asc(statusT.position));
   return rows.map(toDto);
}
