import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { projectTemplate as tmplT, team as teamT } from '@/db/schema';
import { ApiError } from './errors';

type TemplateRow = typeof tmplT.$inferSelect;

export interface ProjectTemplateDto {
   id: string;
   teamId: string;
   name: string;
   projectName: string | null;
   description: string | null;
   statusId: string | null;
   priorityId: string | null;
   healthId: string | null;
}

export interface CreateProjectTemplateInput {
   teamId: string;
   name: string;
   projectName?: string | null;
   description?: string | null;
   statusId?: string | null;
   priorityId?: string | null;
   healthId?: string | null;
}

export type UpdateProjectTemplateInput = Partial<Omit<CreateProjectTemplateInput, 'teamId'>>;

function toDto(r: TemplateRow): ProjectTemplateDto {
   return {
      id: r.id,
      teamId: r.teamId,
      name: r.name,
      projectName: r.projectName,
      description: r.description,
      statusId: r.statusId,
      priorityId: r.priorityId,
      healthId: r.healthId,
   };
}

export async function listProjectTemplatesByTeam(
   db: Db,
   teamId: string
): Promise<ProjectTemplateDto[]> {
   const rows = await db
      .select()
      .from(tmplT)
      .where(eq(tmplT.teamId, teamId))
      .orderBy(asc(tmplT.name));
   return rows.map(toDto);
}

export async function createProjectTemplate(
   db: Db,
   input: CreateProjectTemplateInput
): Promise<ProjectTemplateDto> {
   const teamRows = await db.select().from(teamT).where(eq(teamT.id, input.teamId)).limit(1);
   if (teamRows.length === 0) throw new ApiError(404, `Team '${input.teamId}' não existe`);
   if (!input.name.trim()) throw new ApiError(400, 'Nome do template é obrigatório');

   const id = randomUUID();
   await db.insert(tmplT).values({
      id,
      teamId: input.teamId,
      name: input.name.trim(),
      projectName: input.projectName ?? null,
      description: input.description ?? null,
      statusId: input.statusId ?? null,
      priorityId: input.priorityId ?? null,
      healthId: input.healthId ?? null,
   });
   const [row] = await db.select().from(tmplT).where(eq(tmplT.id, id)).limit(1);
   return toDto(row);
}

export async function updateProjectTemplate(
   db: Db,
   id: string,
   patch: UpdateProjectTemplateInput
): Promise<ProjectTemplateDto | null> {
   const existing = await db.select().from(tmplT).where(eq(tmplT.id, id)).limit(1);
   if (existing.length === 0) return null;

   const values: Partial<TemplateRow> = {};
   if (patch.name !== undefined) values.name = patch.name.trim();
   if (patch.projectName !== undefined) values.projectName = patch.projectName;
   if (patch.description !== undefined) values.description = patch.description;
   if (patch.statusId !== undefined) values.statusId = patch.statusId;
   if (patch.priorityId !== undefined) values.priorityId = patch.priorityId;
   if (patch.healthId !== undefined) values.healthId = patch.healthId;
   if (Object.keys(values).length > 0) {
      await db.update(tmplT).set(values).where(eq(tmplT.id, id));
   }
   const [row] = await db.select().from(tmplT).where(eq(tmplT.id, id)).limit(1);
   return toDto(row);
}

export async function deleteProjectTemplate(db: Db, id: string): Promise<boolean> {
   const existing = await db.select({ id: tmplT.id }).from(tmplT).where(eq(tmplT.id, id)).limit(1);
   if (existing.length === 0) return false;
   await db.delete(tmplT).where(eq(tmplT.id, id));
   return true;
}
