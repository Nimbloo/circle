import { randomUUID } from 'node:crypto';
import { desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { initiative as initT, initiativeUpdate, appUser } from '@/db/schema';
import { ApiError } from './errors';
import { publish } from './events';
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

export async function listInitiativeUpdates(
   db: Db,
   initiativeId: string
): Promise<InitiativeUpdateDto[]> {
   const rows = await db
      .select()
      .from(initiativeUpdate)
      .where(eq(initiativeUpdate.initiativeId, initiativeId))
      .orderBy(desc(initiativeUpdate.createdAt));
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
 * catálogo health. Antes o healthId era estático e a aba Activity era stub.
 */
export async function postInitiativeUpdate(
   db: Db,
   initiativeId: string,
   authorId: string,
   input: PostInitiativeUpdateInput
): Promise<InitiativeUpdateDto> {
   await assertInitiative(db, initiativeId);
   if (!UPDATE_HEALTHS.includes(input.health)) throw new ApiError(400, 'health inválido');
   const id = randomUUID();
   const now = new Date();
   await db.insert(initiativeUpdate).values({
      id,
      initiativeId,
      authorId,
      health: input.health,
      blocks: JSON.stringify(input.blocks ?? []),
      createdAt: now,
   });
   await db.update(initT).set({ healthId: input.health }).where(eq(initT.id, initiativeId));
   const users = await loadUsers(db, [authorId]);
   publish({ entity: 'initiative', action: 'updated', id: initiativeId });
   return {
      id,
      author: userRef(users.get(authorId)),
      health: input.health,
      blocks: input.blocks ?? [],
      createdAt: now.toISOString(),
   };
}
