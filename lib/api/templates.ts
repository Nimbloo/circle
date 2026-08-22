import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { issueTemplate as tmplT, team as teamT } from '@/db/schema';
import { ApiError } from './errors';

type TemplateRow = typeof tmplT.$inferSelect;

export interface TemplateDto {
   id: string;
   teamId: string;
   name: string;
   title: string | null;
   description: string | null;
   statusId: string | null;
   priorityId: string | null;
}

export interface CreateTemplateInput {
   teamId: string;
   name: string;
   title?: string | null;
   description?: string | null;
   statusId?: string | null;
   priorityId?: string | null;
}

export type UpdateTemplateInput = Partial<Omit<CreateTemplateInput, 'teamId'>>;

function toDto(r: TemplateRow): TemplateDto {
   return {
      id: r.id,
      teamId: r.teamId,
      name: r.name,
      title: r.title,
      description: r.description,
      statusId: r.statusId,
      priorityId: r.priorityId,
   };
}

/** Templates de um time (ordenados por nome). */
export async function listTemplatesByTeam(db: Db, teamId: string): Promise<TemplateDto[]> {
   const rows = await db
      .select()
      .from(tmplT)
      .where(eq(tmplT.teamId, teamId))
      .orderBy(asc(tmplT.name));
   return rows.map(toDto);
}

export async function createTemplate(db: Db, input: CreateTemplateInput): Promise<TemplateDto> {
   const teamRows = await db.select().from(teamT).where(eq(teamT.id, input.teamId)).limit(1);
   if (teamRows.length === 0) throw new ApiError(404, `Team '${input.teamId}' não existe`);
   if (!input.name.trim()) throw new ApiError(400, 'Nome do template é obrigatório');

   const id = randomUUID();
   await db.insert(tmplT).values({
      id,
      teamId: input.teamId,
      name: input.name.trim(),
      title: input.title ?? null,
      description: input.description ?? null,
      statusId: input.statusId ?? null,
      priorityId: input.priorityId ?? null,
   });
   const [row] = await db.select().from(tmplT).where(eq(tmplT.id, id)).limit(1);
   return toDto(row);
}

export async function updateTemplate(
   db: Db,
   id: string,
   patch: UpdateTemplateInput
): Promise<TemplateDto | null> {
   const existing = await db.select().from(tmplT).where(eq(tmplT.id, id)).limit(1);
   if (existing.length === 0) return null;

   const values: Partial<TemplateRow> = {};
   if (patch.name !== undefined) values.name = patch.name.trim();
   if (patch.title !== undefined) values.title = patch.title;
   if (patch.description !== undefined) values.description = patch.description;
   if (patch.statusId !== undefined) values.statusId = patch.statusId;
   if (patch.priorityId !== undefined) values.priorityId = patch.priorityId;
   if (Object.keys(values).length > 0) {
      await db.update(tmplT).set(values).where(eq(tmplT.id, id));
   }
   const [row] = await db.select().from(tmplT).where(eq(tmplT.id, id)).limit(1);
   return toDto(row);
}

export async function deleteTemplate(db: Db, id: string): Promise<boolean> {
   const existing = await db.select({ id: tmplT.id }).from(tmplT).where(eq(tmplT.id, id)).limit(1);
   if (existing.length === 0) return false;
   await db.delete(tmplT).where(eq(tmplT.id, id));
   return true;
}
