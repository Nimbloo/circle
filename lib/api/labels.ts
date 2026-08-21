import { asc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { label as labelT, issueLabel, projectLabel } from '@/db/schema';
import { ApiError } from './errors';
import { publish } from './events';

export interface LabelDto {
   id: string;
   name: string;
   color: string;
}

type LabelRow = typeof labelT.$inferSelect;

function toDto(r: LabelRow): LabelDto {
   return { id: r.id, name: r.name, color: r.color };
}

/** Slug a partir do name: lowercase, espaços→'-', só [a-z0-9-]. */
function slugify(name: string): string {
   return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
}

/** Lista labels ordenados por nome. */
export async function listLabels(db: Db): Promise<LabelDto[]> {
   const rows = await db.select().from(labelT).orderBy(asc(labelT.name));
   return rows.map(toDto);
}

async function getLabelRow(db: Db, id: string): Promise<LabelRow | null> {
   const rows = await db.select().from(labelT).where(eq(labelT.id, id)).limit(1);
   return rows[0] ?? null;
}

export interface CreateLabelInput {
   id?: string;
   name: string;
   color: string;
}

/** Cria um label. Sem id explícito, deriva o id do slug do name. Rejeita id duplicado (409). */
export async function createLabel(db: Db, input: CreateLabelInput): Promise<LabelDto> {
   const name = input.name.trim();
   const id = input.id?.trim() || slugify(name) || '';
   if (!id) throw new ApiError(400, 'Não foi possível derivar um id do name');

   const existing = await getLabelRow(db, id);
   if (existing) throw new ApiError(409, `Label '${id}' já existe`);

   await db.insert(labelT).values({ id, name, color: input.color.trim() });
   publish({ entity: 'label', action: 'created', id });
   return (await getLabelRow(db, id).then((r) => r && toDto(r)))!;
}

export interface UpdateLabelInput {
   name?: string;
   color?: string;
}

/** Atualiza name e/ou color de um label. Retorna null se não existir. */
export async function updateLabel(
   db: Db,
   id: string,
   patch: UpdateLabelInput
): Promise<LabelDto | null> {
   const existing = await getLabelRow(db, id);
   if (!existing) return null;

   const next: Partial<LabelRow> = {};
   if (patch.name !== undefined) next.name = patch.name.trim();
   if (patch.color !== undefined) next.color = patch.color.trim();

   if (Object.keys(next).length > 0) {
      await db.update(labelT).set(next).where(eq(labelT.id, id));
   }
   publish({ entity: 'label', action: 'updated', id });
   return toDto({ ...existing, ...next });
}

/** Remove um label. Limpa issue_label e project_label antes (evita violar FK). Retorna false se não existir. */
export async function deleteLabel(db: Db, id: string): Promise<boolean> {
   const existing = await getLabelRow(db, id);
   if (!existing) return false;

   await db.transaction(async (tx) => {
      await tx.delete(issueLabel).where(eq(issueLabel.labelId, id));
      await tx.delete(projectLabel).where(eq(projectLabel.labelId, id));
      await tx.delete(labelT).where(eq(labelT.id, id));
   });
   publish({ entity: 'label', action: 'deleted', id });
   return true;
}
