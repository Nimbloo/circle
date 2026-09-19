import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { label as labelT, initiativeLabel, issueLabel, projectLabel } from '@/db/schema';
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

   const explicit = input.id?.trim();
   if (explicit) {
      if (await getLabelRow(db, explicit)) throw new ApiError(409, `Label '${explicit}' já existe`);
      await db.insert(labelT).values({ id: explicit, name, color });
      return created(db, explicit);
   }

   const base = (slugify(name) || 'label').slice(0, 56);
   for (let n = 1; n <= MAX_SLUG_ATTEMPTS; n++) {
      const id = n === 1 ? base : `${base}-${n}`;
      // `onConflictDoNothing`: outro create concorrente pode ter pego o mesmo slug.
      const inserted = await db
         .insert(labelT)
         .values({ id, name, color })
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
