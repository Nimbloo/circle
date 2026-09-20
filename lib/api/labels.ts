import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   label as labelT,
   labelGroup as labelGroupT,
   initiativeLabel,
   issueLabel,
   projectLabel,
} from '@/db/schema';
import { ApiError } from './errors';
import { publish } from './events';

export interface LabelDto {
   id: string;
   name: string;
   color: string;
   /** Grupo exclusivo (aditivo). null = label solta. */
   groupId: string | null;
}

/** Grupo de labels (paridade Linear): uma label por grupo em cada issue. */
export interface LabelGroupDto {
   id: string;
   name: string;
   color: string;
   position: number;
}

type LabelRow = typeof labelT.$inferSelect;

function toDto(r: LabelRow): LabelDto {
   return { id: r.id, name: r.name, color: r.color, groupId: r.groupId ?? null };
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
   groupId?: string | null;
}

/** O grupo informado tem que existir (400); null/undefined = sem grupo. */
async function resolveGroupId(db: Db, groupId: string | null | undefined): Promise<string | null> {
   const id = groupId?.trim();
   if (!id) return null;
   const rows = await db
      .select({ id: labelGroupT.id })
      .from(labelGroupT)
      .where(eq(labelGroupT.id, id))
      .limit(1);
   if (rows.length === 0) throw new ApiError(400, `Grupo de label '${id}' não existe`);
   return id;
}

/** Outra label já usa este nome (sem diferenciar caixa nem espaços das pontas)? */
async function nameTaken(db: Db, name: string, exceptId?: string): Promise<boolean> {
   const sameName = sql`lower(trim(${labelT.name})) = ${name.toLowerCase()}`;
   const rows = await db
      .select({ id: labelT.id })
      .from(labelT)
      .where(exceptId ? and(sameName, ne(labelT.id, exceptId)) : sameName)
      .limit(1);
   return rows.length > 0;
}

/** Tentativas de sufixo para achar um slug livre (`x`, `x-2`, `x-3`…). */
const MAX_SLUG_ATTEMPTS = 50;

/**
 * Cria um label. O NOME é único (409, sem diferenciar caixa — Ad#34). Sem id explícito,
 * o id é o slug do name, com sufixo quando outro nome já gerou o mesmo slug (antes dava
 * 409 por colisão de slug). Id explícito duplicado continua 409.
 */
export async function createLabel(db: Db, input: CreateLabelInput): Promise<LabelDto> {
   const name = input.name.trim();
   if (!name) throw new ApiError(400, 'name é obrigatório');
   if (await nameTaken(db, name)) throw new ApiError(409, `Label '${name}' já existe`);
   const color = input.color.trim();
   const groupId = await resolveGroupId(db, input.groupId);

   const explicit = input.id?.trim();
   if (explicit) {
      if (await getLabelRow(db, explicit)) throw new ApiError(409, `Label '${explicit}' já existe`);
      await db.insert(labelT).values({ id: explicit, name, color, groupId });
      return created(db, explicit);
   }

   const base = (slugify(name) || 'label').slice(0, 56);
   for (let n = 1; n <= MAX_SLUG_ATTEMPTS; n++) {
      const id = n === 1 ? base : `${base}-${n}`;
      // `onConflictDoNothing`: outro create concorrente pode ter pego o mesmo slug.
      const inserted = await db
         .insert(labelT)
         .values({ id, name, color, groupId })
         .onConflictDoNothing()
         .returning({ id: labelT.id });
      if (inserted.length > 0) return created(db, id);
   }
   throw new ApiError(409, `Não foi possível gerar um id livre para '${name}'`);
}

async function created(db: Db, id: string): Promise<LabelDto> {
   publish({ entity: 'label', action: 'created', id });
   return (await getLabelRow(db, id).then((r) => r && toDto(r)))!;
}

export interface UpdateLabelInput {
   name?: string;
   color?: string;
   /** Move a label para um grupo (ou tira dele com null). */
   groupId?: string | null;
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
   if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new ApiError(400, 'name é obrigatório');
      // Renomear não pode duplicar o nome de outra label (Ad#34).
      if (await nameTaken(db, name, id)) throw new ApiError(409, `Label '${name}' já existe`);
      next.name = name;
   }
   if (patch.color !== undefined) next.color = patch.color.trim();
   if (patch.groupId !== undefined) next.groupId = await resolveGroupId(db, patch.groupId);

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
      await tx.delete(initiativeLabel).where(eq(initiativeLabel.labelId, id));
      await tx.delete(labelT).where(eq(labelT.id, id));
   });
   publish({ entity: 'label', action: 'deleted', id });
   return true;
}

/* -------------------------------------------------------------------------- */
/*                               Grupos de label                               */
/* -------------------------------------------------------------------------- */

function toGroupDto(r: typeof labelGroupT.$inferSelect): LabelGroupDto {
   return { id: r.id, name: r.name, color: r.color, position: r.position };
}

/*
 * Os grupos vivem no bootstrap do workspace: os eventos saem como `catalog` sem `kind`,
 * que o cliente responde re-hidratando o workspace (grupos + labels, já que excluir um
 * grupo solta as labels dele).
 */

/** Grupos na ordem de exibição (position, depois nome). */
export async function listLabelGroups(db: Db): Promise<LabelGroupDto[]> {
   const rows = await db
      .select()
      .from(labelGroupT)
      .orderBy(asc(labelGroupT.position), asc(labelGroupT.name));
   return rows.map(toGroupDto);
}

async function groupNameTaken(db: Db, name: string, exceptId?: string): Promise<boolean> {
   const sameName = sql`lower(trim(${labelGroupT.name})) = ${name.toLowerCase()}`;
   const rows = await db
      .select({ id: labelGroupT.id })
      .from(labelGroupT)
      .where(exceptId ? and(sameName, ne(labelGroupT.id, exceptId)) : sameName)
      .limit(1);
   return rows.length > 0;
}

/** Cria um grupo. Nome único sem diferenciar caixa (409); id = slug do nome. */
export async function createLabelGroup(
   db: Db,
   input: { name: string; color?: string | null }
): Promise<LabelGroupDto> {
   const name = input.name.trim();
   if (!name) throw new ApiError(400, 'name é obrigatório');
   if (await groupNameTaken(db, name)) throw new ApiError(409, `Grupo '${name}' já existe`);
   const color = input.color?.trim() || 'gray';
   const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${labelGroupT.position}), -1)` })
      .from(labelGroupT);
   const base = (slugify(name) || 'group').slice(0, 56);
   for (let n = 1; n <= MAX_SLUG_ATTEMPTS; n++) {
      const id = n === 1 ? base : `${base}-${n}`;
      const inserted = await db
         .insert(labelGroupT)
         .values({ id, name, color, position: Number(max) + 1 })
         .onConflictDoNothing()
         .returning();
      if (inserted.length > 0) {
         publish({ entity: 'catalog', action: 'created', id });
         return toGroupDto(inserted[0]);
      }
   }
   throw new ApiError(409, `Não foi possível gerar um id livre para '${name}'`);
}

/** Renomeia/recolore um grupo. null se não existir. */
export async function updateLabelGroup(
   db: Db,
   id: string,
   patch: { name?: string; color?: string }
): Promise<LabelGroupDto | null> {
   const next: Partial<typeof labelGroupT.$inferInsert> = {};
   if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new ApiError(400, 'name é obrigatório');
      if (await groupNameTaken(db, name, id)) throw new ApiError(409, `Grupo '${name}' já existe`);
      next.name = name;
   }
   if (patch.color !== undefined) next.color = patch.color.trim() || 'gray';
   const rows =
      Object.keys(next).length > 0
         ? await db.update(labelGroupT).set(next).where(eq(labelGroupT.id, id)).returning()
         : await db.select().from(labelGroupT).where(eq(labelGroupT.id, id)).limit(1);
   if (rows.length === 0) return null;
   publish({ entity: 'catalog', action: 'updated', id });
   return toGroupDto(rows[0]);
}

/** Exclui o grupo e solta as labels dele (continuam existindo, sem grupo). */
export async function deleteLabelGroup(db: Db, id: string): Promise<boolean> {
   const removed = await db.transaction(async (tx) => {
      await tx.update(labelT).set({ groupId: null }).where(eq(labelT.groupId, id));
      return tx.delete(labelGroupT).where(eq(labelGroupT.id, id)).returning({ id: labelGroupT.id });
   });
   if (removed.length === 0) return false;
   publish({ entity: 'catalog', action: 'deleted', id });
   return true;
}
