import { randomUUID } from 'node:crypto';
import { desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { initiative as initT, initiativeUpdate, appUser } from '@/db/schema';
import { ApiError } from './errors';
import { updateHasContent } from './project-detail';
import { publish } from './events';
import { getInitiative, type InitiativeDto } from './initiatives';
import type { UserRef } from './issues';
import type { ContentBlock } from '@/data/issue-details';

export type InitiativeUpdateHealth = 'on-track' | 'at-risk' | 'off-track';
export const UPDATE_HEALTHS: readonly InitiativeUpdateHealth[] = [
   'on-track',
   'at-risk',
   'off-track',
];

export interface InitiativeUpdateDto {
   id: string;
   author: UserRef | null;
   health: InitiativeUpdateHealth;
   blocks: ContentBlock[];
   createdAt: string;
}

export interface PostInitiativeUpdateInput {
   health: InitiativeUpdateHealth;
   blocks?: ContentBlock[];
}

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : String(d));

function userRef(u: typeof appUser.$inferSelect | undefined): UserRef | null {
   return u
      ? { id: u.id, slug: u.slug, name: u.name, email: u.email, avatarUrl: u.avatarUrl }
      : null;
}

function parseBlocks(raw: string): ContentBlock[] {
   try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? (v as ContentBlock[]) : [];
   } catch {
      return [];
   }
}

async function loadUsers(db: Db, ids: string[]) {
   const uniq = [...new Set(ids.filter(Boolean))];
   if (uniq.length === 0) return new Map<string, typeof appUser.$inferSelect>();
   const rows = await db.select().from(appUser).where(inArray(appUser.id, uniq));
   return new Map(rows.map((u) => [u.id, u]));
}

async function assertInitiative(db: Db, id: string): Promise<void> {
   const rows = await db.select({ id: initT.id }).from(initT).where(eq(initT.id, id)).limit(1);
   if (rows.length === 0) throw new ApiError(404, `Initiative '${id}' não encontrada`);
}

/** Teto do feed (mais recentes primeiro), igual ao do projeto. */
export const DEFAULT_INITIATIVE_FEED_LIMIT = 100;

export async function listInitiativeUpdates(
   db: Db,
   initiativeId: string,
   limit = DEFAULT_INITIATIVE_FEED_LIMIT
): Promise<InitiativeUpdateDto[]> {
   const rows = await db
      .select()
      .from(initiativeUpdate)
      .where(eq(initiativeUpdate.initiativeId, initiativeId))
      .orderBy(desc(initiativeUpdate.createdAt))
      .limit(limit);
   const users = await loadUsers(
      db,
      rows.map((r) => r.authorId)
   );
   return rows.map((r) => ({
      id: r.id,
      author: userRef(users.get(r.authorId)),
      health: (r.health as InitiativeUpdateHealth) ?? 'on-track',
      blocks: parseBlocks(r.blocks),
      createdAt: iso(r.createdAt),
   }));
}

/**
 * Posta um update de initiative e PROPAGA o health pro initiative.healthId (paridade
 * Linear: health = último update). Os valores on-track/at-risk/off-track são ids do
 * catálogo health. Devolve o update e a initiative já atualizada, pro cliente aplicar
 * no store (`applyInitiative`) sem re-hidratar o workspace.
 */
export async function postInitiativeUpdate(
   db: Db,
   initiativeId: string,
   authorId: string,
   input: PostInitiativeUpdateInput
): Promise<{ update: InitiativeUpdateDto; initiative: InitiativeDto }> {
   await assertInitiative(db, initiativeId);
   if (!UPDATE_HEALTHS.includes(input.health)) throw new ApiError(400, 'health inválido');
   if (!updateHasContent(input.blocks)) throw new ApiError(400, 'update sem conteúdo');
   const id = randomUUID();
   const now = new Date();
   // Update e health propagado juntos: sem transação, uma falha no meio deixava o
   // update gravado com o health antigo na initiative.
   await db.transaction(async (tx) => {
      await tx.insert(initiativeUpdate).values({
         id,
         initiativeId,
         authorId,
         health: input.health,
         blocks: JSON.stringify(input.blocks ?? []),
         createdAt: now,
      });
      await tx.update(initT).set({ healthId: input.health }).where(eq(initT.id, initiativeId));
   });
   const [users, initiative] = await Promise.all([
      loadUsers(db, [authorId]),
      getInitiative(db, initiativeId),
   ]);
   if (!initiative) throw new ApiError(404, `Initiative '${initiativeId}' não encontrada`);
   publish({ entity: 'initiative', action: 'updated', id: initiativeId });
   return {
      update: {
         id,
         author: userRef(users.get(authorId)),
         health: input.health,
         blocks: input.blocks ?? [],
         createdAt: now.toISOString(),
      },
      initiative,
   };
}

/** Health da initiative = health do último update; sem update volta a `no-update`. */
async function syncInitiativeHealth(tx: Db, initiativeId: string): Promise<void> {
   const [latest] = await tx
      .select({ health: initiativeUpdate.health })
      .from(initiativeUpdate)
      .where(eq(initiativeUpdate.initiativeId, initiativeId))
      .orderBy(desc(initiativeUpdate.createdAt))
      .limit(1);
   await tx
      .update(initT)
      .set({ healthId: latest ? latest.health : 'no-update' })
      .where(eq(initT.id, initiativeId));
}

export interface EditInitiativeUpdateInput {
   health?: InitiativeUpdateHealth;
   blocks?: ContentBlock[];
}

/** Edita um update da initiative (pl#11), repropagando o health do mais recente. */
export async function editInitiativeUpdate(
   db: Db,
   initiativeId: string,
   updateId: string,
   input: EditInitiativeUpdateInput
): Promise<{ update: InitiativeUpdateDto; initiative: InitiativeDto }> {
   const [row] = await db
      .select()
      .from(initiativeUpdate)
      .where(eq(initiativeUpdate.id, updateId))
      .limit(1);
   if (!row || row.initiativeId !== initiativeId)
      throw new ApiError(404, `Update '${updateId}' não encontrado`);
   if (input.health && !UPDATE_HEALTHS.includes(input.health))
      throw new ApiError(400, 'health inválido');
   const blocks = input.blocks ?? parseBlocks(row.blocks);
   if (!updateHasContent(blocks)) throw new ApiError(400, 'update sem conteúdo');
   const health = input.health ?? (row.health as InitiativeUpdateHealth);

   await db.transaction(async (tx) => {
      await tx
         .update(initiativeUpdate)
         .set({ health, blocks: JSON.stringify(blocks) })
         .where(eq(initiativeUpdate.id, updateId));
      await syncInitiativeHealth(tx as unknown as Db, initiativeId);
   });
   const [users, initiative] = await Promise.all([
      loadUsers(db, [row.authorId]),
      getInitiative(db, initiativeId),
   ]);
   if (!initiative) throw new ApiError(404, `Initiative '${initiativeId}' não encontrada`);
   publish({ entity: 'initiative', action: 'updated', id: initiativeId });
   return {
      update: {
         id: row.id,
         author: userRef(users.get(row.authorId)),
         health,
         blocks,
         createdAt: iso(row.createdAt),
      },
      initiative,
   };
}

/** Exclui um update da initiative; devolve a initiative com o health recalculado. */
export async function deleteInitiativeUpdate(
   db: Db,
   initiativeId: string,
   updateId: string
): Promise<InitiativeDto | null> {
   const [row] = await db
      .select({ id: initiativeUpdate.id, initiativeId: initiativeUpdate.initiativeId })
      .from(initiativeUpdate)
      .where(eq(initiativeUpdate.id, updateId))
      .limit(1);
   if (!row || row.initiativeId !== initiativeId) return null;
   await db.transaction(async (tx) => {
      await tx.delete(initiativeUpdate).where(eq(initiativeUpdate.id, updateId));
      await syncInitiativeHealth(tx as unknown as Db, initiativeId);
   });
   publish({ entity: 'initiative', action: 'updated', id: initiativeId });
   return getInitiative(db, initiativeId);
}
