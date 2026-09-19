import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Db } from '@/db';
import { favorite, issue as issueT, project as projectT, savedView } from '@/db/schema';
import { visibleTeamIds } from './scope';
import { getOrCreateUser } from './users';
import { ApiError } from './errors';
import { publish } from './events';

export type FavoriteEntityType = 'issue' | 'project' | 'view';
const ENTITY_TYPES: FavoriteEntityType[] = ['issue', 'project', 'view'];

export interface FavoriteDto {
   id: string;
   entityType: FavoriteEntityType;
   entityId: string;
   name: string;
   /** Só para issue: identifier (ENG-42) usado no href /issue/{identifier}. */
   identifier: string | null;
   /** project.iconKey / view.icon. */
   iconKey: string | null;
   position: number;
}

function assertType(t: string): asserts t is FavoriteEntityType {
   if (!ENTITY_TYPES.includes(t as FavoriteEntityType))
      throw new ApiError(400, `entityType inválido: ${t}`);
}

/**
 * Favoritos do usuário, com nome/ícone resolvidos por tipo. Entidades já
 * removidas são silenciosamente omitidas (a linha órfã fica no banco até o
 * próximo toggle — barato e evita cascade polimorfica).
 */
export async function listFavorites(db: Db, userEmail: string): Promise<FavoriteDto[]> {
   const user = await getOrCreateUser(db, userEmail);
   const rows = await db
      .select()
      .from(favorite)
      .where(eq(favorite.userId, user.id))
      .orderBy(asc(favorite.position), asc(favorite.createdAt));
   if (rows.length === 0) return [];

   const byType = (t: FavoriteEntityType) =>
      rows.filter((r) => r.entityType === t).map((r) => r.entityId);

   const issueIds = byType('issue');
   const projectIds = byType('project');
   const viewIds = byType('view');

   // Escopo (#100): favorito é do usuário, mas o resolve devolve título e identifier da
   // entidade — se ela saiu do escopo (convidado removido do time), some da lista em vez
   // de vazar o nome. A linha continua no banco, como nas entidades apagadas.
   const teamIds = await visibleTeamIds(db, user);

   const [issues, projects, views] = await Promise.all([
      issueIds.length
         ? db
              .select({ id: issueT.id, title: issueT.title, identifier: issueT.identifier })
              .from(issueT)
              .where(
                 teamIds
                    ? and(inArray(issueT.id, issueIds), inArray(issueT.teamId, teamIds))
                    : inArray(issueT.id, issueIds)
              )
         : Promise.resolve([]),
      projectIds.length
         ? db
              .select({ id: projectT.id, name: projectT.name, iconKey: projectT.iconKey })
              .from(projectT)
              .where(
                 teamIds
                    ? and(inArray(projectT.id, projectIds), inArray(projectT.teamId, teamIds))
                    : inArray(projectT.id, projectIds)
              )
         : Promise.resolve([]),
      viewIds.length
         ? db
              .select({ id: savedView.id, name: savedView.name, icon: savedView.icon })
              .from(savedView)
              .where(
                 teamIds
                    ? and(
                         inArray(savedView.id, viewIds),
                         or(isNull(savedView.teamId), inArray(savedView.teamId, teamIds))!
                      )
                    : inArray(savedView.id, viewIds)
              )
         : Promise.resolve([]),
   ]);

   const issueMap = new Map(issues.map((i) => [i.id, i]));
   const projectMap = new Map(projects.map((p) => [p.id, p]));
   const viewMap = new Map(views.map((v) => [v.id, v]));

   const out: FavoriteDto[] = [];
   for (const r of rows) {
      if (r.entityType === 'issue') {
         const e = issueMap.get(r.entityId);
         if (!e) continue;
         out.push({ ...refBase(r), name: e.title, identifier: e.identifier, iconKey: null });
      } else if (r.entityType === 'project') {
         const e = projectMap.get(r.entityId);
         if (!e) continue;
         out.push({ ...refBase(r), name: e.name, identifier: null, iconKey: e.iconKey ?? null });
      } else {
         const e = viewMap.get(r.entityId);
         if (!e) continue;
         out.push({ ...refBase(r), name: e.name, identifier: null, iconKey: e.icon ?? null });
      }
   }
   return out;
}

function refBase(r: typeof favorite.$inferSelect) {
   return {
      id: r.id,
      entityType: r.entityType as FavoriteEntityType,
      entityId: r.entityId,
      position: r.position,
   };
}

export async function addFavorite(
   db: Db,
   userEmail: string,
   entityType: string,
   entityId: string
): Promise<{ added: boolean }> {
   assertType(entityType);
   const user = await getOrCreateUser(db, userEmail);
   const max = await db
      .select({ position: favorite.position })
      .from(favorite)
      .where(eq(favorite.userId, user.id))
      .orderBy(asc(favorite.position));
   const nextPos = max.length ? Math.max(...max.map((m) => m.position)) + 1 : 0;

   const res = await db
      .insert(favorite)
      .values({ id: randomUUID(), userId: user.id, entityType, entityId, position: nextPos })
      .onConflictDoNothing()
      .returning({ id: favorite.id });
   // Outras abas/dispositivos do MESMO usuário atualizam a sidebar (só o dono recebe).
   if (res.length > 0)
      publish({ entity: 'favorite', action: 'created', id: entityId, recipientId: user.id });
   return { added: res.length > 0 };
}

/**
 * Reordena os favoritos do usuario (co#16): `ids` na ordem desejada; os que ficaram de
 * fora (ou nao sao do usuario) mantem a ordem atual, depois dos enviados.
 */
export async function reorderFavorites(
   db: Db,
   userEmail: string,
   ids: string[]
): Promise<{ reordered: number }> {
   const user = await getOrCreateUser(db, userEmail);
   const rows = await db
      .select({ id: favorite.id })
      .from(favorite)
      .where(eq(favorite.userId, user.id))
      .orderBy(asc(favorite.position), asc(favorite.createdAt));
   const own = new Set(rows.map((r) => r.id));
   const wanted = ids.filter((id) => own.has(id));
   const order = [...wanted, ...rows.map((r) => r.id).filter((id) => !wanted.includes(id))];
   await Promise.all(
      order.map((id, index) =>
         db.update(favorite).set({ position: index }).where(eq(favorite.id, id))
      )
   );
   if (wanted.length > 0)
      publish({ entity: 'favorite', action: 'updated', id: user.id, recipientId: user.id });
   return { reordered: wanted.length };
}

export async function removeFavorite(
   db: Db,
   userEmail: string,
   entityType: string,
   entityId: string
): Promise<{ removed: boolean }> {
   assertType(entityType);
   const user = await getOrCreateUser(db, userEmail);
   const res = await db
      .delete(favorite)
      .where(
         and(
            eq(favorite.userId, user.id),
            eq(favorite.entityType, entityType),
            eq(favorite.entityId, entityId)
         )
      )
      .returning({ id: favorite.id });
   if (res.length > 0)
      publish({ entity: 'favorite', action: 'deleted', id: entityId, recipientId: user.id });
   return { removed: res.length > 0 };
}
