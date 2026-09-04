import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   initiative as initT,
   initiativeActivity,
   initiativeLabel,
   initiativeProject,
   project as projectT,
   priority as priorityT,
   health as healthT,
   projectStatus as projectStatusT,
   appUser,
   label as labelT,
} from '@/db/schema';
import { targetDateFromLabel } from '@/lib/initiative-period';
import { ApiError } from './errors';
import { publish } from './events';
import { getOrCreateUser } from './users';
import { assertInitiativeParent } from './hierarchy';
import type { UserRef } from './issues';

type InitiativeRow = typeof initT.$inferSelect;
type PriorityRow = typeof priorityT.$inferSelect;
type HealthRow = typeof healthT.$inferSelect;
type LabelRow = typeof labelT.$inferSelect;

export interface InitiativeDto {
   id: string;
   slug: string;
   name: string;
   description: string | null;
   icon: string | null;
   iconColor: string | null;
   status: string;
   priority: PriorityRow;
   health: HealthRow;
   owner: UserRef | null;
   /** Rótulo humano do período alvo ("Q3 2026"); `targetDate` é a data real dele. */
   target: string | null;
   startDate: string | null;
   targetDate: string | null;
   labels: LabelRow[];
   projectIds: string[];
   projectCount: number;
   completedProjectCount: number;
   /** Sub-initiatives (#100): initiative pai, ou null quando é de topo. */
   parentId: string | null;
   /** Ids das sub-initiatives DIRETAS (ordem alfabética por nome). */
   childIds: string[];
   /**
    * Rollup (#100): projetos e concluídos somando esta initiative e TODA a sua
    * subárvore. Igual a `projectCount`/`completedProjectCount` quando não há filhas.
    */
   rollupProjectCount: number;
   rollupCompletedProjectCount: number;
   createdAt: string;
}

interface Maps {
   priorities: Map<string, PriorityRow>;
   healths: Map<string, HealthRow>;
   labels: Map<string, LabelRow>;
}

async function loadMaps(db: Db): Promise<Maps> {
   const [priorities, healths, labels] = await Promise.all([
      db.select().from(priorityT),
      db.select().from(healthT),
      db.select().from(labelT),
   ]);
   return {
      priorities: new Map(priorities.map((p) => [p.id, p])),
      healths: new Map(healths.map((h) => [h.id, h])),
      labels: new Map(labels.map((label) => [label.id, label])),
   };
}

/** Para um conjunto de initiatives: seus projectIds e quantos estão completos. */
async function projectsByInitiative(db: Db, initIds: string[]) {
   const links = initIds.length
      ? await db
           .select()
           .from(initiativeProject)
           .where(inArray(initiativeProject.initiativeId, initIds))
      : [];
   const projectIds = [...new Set(links.map((l) => l.projectId))];
   const [projects, statuses] = await Promise.all([
      projectIds.length
         ? db
              .select({
                 id: projectT.id,
                 statusId: projectT.statusId,
                 percentComplete: projectT.percentComplete,
              })
              .from(projectT)
              .where(inArray(projectT.id, projectIds))
         : Promise.resolve([]),
      // Categorias dos status de PROJETO (projeto usa project_status, não o de issue).
      db.select().from(projectStatusT),
   ]);
   const catById = new Map(statuses.map((s) => [s.id, s.category]));
   const isCompleted = new Map(
      projects.map((p) => [
         p.id,
         catById.get(p.statusId) === 'completed' || p.percentComplete >= 100,
      ])
   );

   const byInit = new Map<string, { ids: string[]; completed: number }>();
   for (const id of initIds) byInit.set(id, { ids: [], completed: 0 });
   for (const link of links) {
      const e = byInit.get(link.initiativeId);
      if (!e) continue;
      e.ids.push(link.projectId);
      if (isCompleted.get(link.projectId)) e.completed += 1;
   }
   return { byInit, isCompleted };
}

/** `parentId -> filhos` sobre TODAS as initiatives (tabela pequena). */
function childrenByParent(edges: { id: string; parentId: string | null }[]) {
   const map = new Map<string, string[]>();
   for (const e of edges) {
      if (!e.parentId) continue;
      const arr = map.get(e.parentId);
      if (arr) arr.push(e.id);
      else map.set(e.parentId, [e.id]);
   }
   return map;
}

/** Subárvore de `root` (incluindo ele), com teto contra ciclo em dado legado. */
function subtreeIds(children: Map<string, string[]>, root: string, limit: number): string[] {
   const seen = new Set<string>();
   const queue = [root];
   for (let steps = 0; queue.length > 0 && steps <= limit; steps++) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(...(children.get(id) ?? []));
   }
   return [...seen];
}

async function assemble(db: Db, rows: InitiativeRow[], maps: Maps): Promise<InitiativeDto[]> {
   if (rows.length === 0) return [];
   const ownerIds = [...new Set(rows.map((r) => r.ownerId).filter(Boolean) as string[])];
   const initiativeIds = rows.map((row) => row.id);
   // Sub-initiatives (#100): o rollup precisa das linhas de vínculo de TODA a
   // subárvore, não só das initiatives pedidas — daí carregar as arestas inteiras
   // (tabela pequena) e expandir os ids antes de consultar os projetos.
   const edges = await db
      .select({ id: initT.id, parentId: initT.parentId, name: initT.name })
      .from(initT);
   const children = childrenByParent(edges);
   const nameById = new Map(edges.map((e) => [e.id, e.name]));
   const subtreeByInitiative = new Map(
      initiativeIds.map((id) => [id, subtreeIds(children, id, edges.length + 1)])
   );
   const scopeIds = [...new Set([...initiativeIds, ...subtreeByInitiative.values()].flat())];

   const [owners, projects, labelLinks] = await Promise.all([
      ownerIds.length
         ? db.select().from(appUser).where(inArray(appUser.id, ownerIds))
         : Promise.resolve([]),
      projectsByInitiative(db, scopeIds),
      db.select().from(initiativeLabel).where(inArray(initiativeLabel.initiativeId, initiativeIds)),
   ]);
   const { byInit: projMap, isCompleted } = projects;
   const ownerMap = new Map(owners.map((u) => [u.id, u]));
   const labelIdsByInitiative = new Map<string, string[]>();
   for (const link of labelLinks) {
      const labelIds = labelIdsByInitiative.get(link.initiativeId) ?? [];
      labelIds.push(link.labelId);
      labelIdsByInitiative.set(link.initiativeId, labelIds);
   }

   return rows.map((r) => {
      const owner = r.ownerId ? ownerMap.get(r.ownerId) : undefined;
      const p = projMap.get(r.id) ?? { ids: [], completed: 0 };
      // Rollup: união dos projetos da subárvore (um projeto vinculado a mãe e filha
      // conta uma vez só).
      const rollupProjectIds = new Set<string>();
      for (const id of subtreeByInitiative.get(r.id) ?? [r.id]) {
         for (const pid of projMap.get(id)?.ids ?? []) rollupProjectIds.add(pid);
      }
      return {
         id: r.id,
         slug: r.slug,
         name: r.name,
         description: r.description,
         icon: r.icon,
         iconColor: r.iconColor,
         status: r.status,
         priority: maps.priorities.get(r.priorityId)!,
         health: maps.healths.get(r.healthId)!,
         owner: owner
            ? {
                 id: owner.id,
                 slug: owner.slug,
                 name: owner.name,
                 email: owner.email,
                 avatarUrl: owner.avatarUrl,
              }
            : null,
         target: r.target,
         startDate: r.startDate,
         targetDate: r.targetDate,
         labels: (labelIdsByInitiative.get(r.id) ?? [])
            .map((labelId) => maps.labels.get(labelId))
            .filter((label): label is LabelRow => Boolean(label)),
         projectIds: p.ids,
         projectCount: p.ids.length,
         completedProjectCount: p.completed,
         parentId: r.parentId,
         childIds: (children.get(r.id) ?? [])
            .slice()
            .sort((a, b) => (nameById.get(a) ?? '').localeCompare(nameById.get(b) ?? '')),
         rollupProjectCount: rollupProjectIds.size,
         rollupCompletedProjectCount: [...rollupProjectIds].filter((pid) => isCompleted.get(pid))
            .length,
         createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      };
   });
}

export interface ListInitiativesOptions {
   status?: string[];
   priority?: string[];
   owner?: string[];
   health?: string[];
   /**
    * Escopo de times (#100, Guest): mantém só as initiatives com ao menos um projeto
    * (próprio ou de uma sub-initiative) num time visível. `undefined` = todas.
    */
   teamIds?: string[];
}

export async function listInitiatives(
   db: Db,
   opts: ListInitiativesOptions = {}
): Promise<InitiativeDto[]> {
   const maps = await loadMaps(db);
   const rows = await db.select().from(initT);
   let dtos = await assemble(db, rows, maps);
   if (opts.status?.length) dtos = dtos.filter((d) => opts.status!.includes(d.status));
   if (opts.priority?.length) dtos = dtos.filter((d) => opts.priority!.includes(d.priority.id));
   if (opts.health?.length) dtos = dtos.filter((d) => opts.health!.includes(d.health.id));
   if (opts.owner?.length) dtos = dtos.filter((d) => d.owner && opts.owner!.includes(d.owner.id));
   if (opts.teamIds) dtos = await filterByTeamScope(db, dtos, opts.teamIds);
   return dtos.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Escopo de Guest (#100): a initiative fica visível se algum projeto da sua subárvore
 * pertence a um time visível. A subárvore evita esconder uma initiative-mãe que só
 * organiza filhas.
 */
async function filterByTeamScope(
   db: Db,
   dtos: InitiativeDto[],
   teamIds: string[]
): Promise<InitiativeDto[]> {
   const scope = new Set(teamIds);
   if (scope.size === 0) return [];
   const byId = new Map(dtos.map((d) => [d.id, d]));
   const projectIds = [...new Set(dtos.flatMap((d) => d.projectIds))];
   if (projectIds.length === 0) return [];
   const rows = await db
      .select({ id: projectT.id, teamId: projectT.teamId })
      .from(projectT)
      .where(inArray(projectT.id, projectIds));
   const teamOfProject = new Map(rows.map((r) => [r.id, r.teamId]));
   const visible = (dto: InitiativeDto, seen: Set<string>): boolean => {
      if (seen.has(dto.id)) return false;
      seen.add(dto.id);
      if (dto.projectIds.some((pid) => scope.has(teamOfProject.get(pid) ?? ''))) return true;
      return dto.childIds.some((cid) => {
         const child = byId.get(cid);
         return child ? visible(child, seen) : false;
      });
   };
   return dtos.filter((d) => visible(d, new Set()));
}

export async function getInitiative(db: Db, id: string): Promise<InitiativeDto | null> {
   const maps = await loadMaps(db);
   const rows = await db.select().from(initT).where(eq(initT.id, id)).limit(1);
   if (rows.length === 0) return null;
   return (await assemble(db, rows, maps))[0];
}

export interface CreateInitiativeInput {
   slug: string;
   name: string;
   priorityId: string;
   healthId: string;
   status?: string;
   description?: string | null;
   icon?: string | null;
   iconColor?: string | null;
   ownerId?: string | null;
   target?: string | null;
   /** ISO `YYYY-MM-DD`. Quando só `target` vier, `targetDate` é derivada do rótulo. */
   startDate?: string | null;
   targetDate?: string | null;
   projectIds?: string[];
   labelIds?: string[];
   /** Sub-initiatives (#100): initiative pai. */
   parentId?: string | null;
}

export async function createInitiative(
   db: Db,
   input: CreateInitiativeInput
): Promise<InitiativeDto> {
   if (!input.name?.trim() || !input.slug?.trim())
      throw new ApiError(400, 'slug e name são obrigatórios');
   const maps = await loadMaps(db);
   if (!maps.priorities.has(input.priorityId))
      throw new ApiError(400, `priority '${input.priorityId}' inválido`);
   if (!maps.healths.has(input.healthId))
      throw new ApiError(400, `health '${input.healthId}' inválido`);
   const labelIds = [...new Set(input.labelIds ?? [])];
   const unknownLabelId = labelIds.find((labelId) => !maps.labels.has(labelId));
   if (unknownLabelId) throw new ApiError(400, `label '${unknownLabelId}' inválido`);
   if (input.parentId) {
      const parent = await db
         .select({ id: initT.id })
         .from(initT)
         .where(eq(initT.id, input.parentId))
         .limit(1);
      if (!parent.length) throw new ApiError(400, `initiative pai '${input.parentId}' inválida`);
   }
   const id = randomUUID();
   await db.transaction(async (tx) => {
      await tx.insert(initT).values({
         id,
         slug: input.slug,
         name: input.name,
         description: input.description ?? null,
         icon: input.icon ?? null,
         iconColor: input.iconColor ?? null,
         status: input.status ?? 'planned',
         priorityId: input.priorityId,
         ownerId: input.ownerId ?? null,
         target: input.target ?? null,
         startDate: input.startDate ?? null,
         targetDate:
            input.targetDate !== undefined ? input.targetDate : targetDateFromLabel(input.target),
         healthId: input.healthId,
         parentId: input.parentId ?? null,
         createdAt: new Date(),
      });
      if (labelIds.length) {
         await tx
            .insert(initiativeLabel)
            .values(labelIds.map((labelId) => ({ initiativeId: id, labelId })));
      }
      if (input.projectIds?.length) {
         await tx
            .insert(initiativeProject)
            .values(input.projectIds.map((projectId) => ({ initiativeId: id, projectId })))
            .onConflictDoNothing();
         // Mantém project.initiativeId em sincronia com a tabela de vínculo.
         await tx
            .update(projectT)
            .set({ initiativeId: id })
            .where(inArray(projectT.id, input.projectIds));
      }
   });
   publish({ entity: 'initiative', action: 'created', id });
   return (await getInitiative(db, id))!;
}

export interface UpdateInitiativeInput {
   name?: string;
   description?: string | null;
   icon?: string | null;
   iconColor?: string | null;
   status?: string;
   priorityId?: string;
   healthId?: string;
   ownerId?: string | null;
   target?: string | null;
   startDate?: string | null;
   targetDate?: string | null;
   projectIds?: string[];
   labelIds?: string[];
   /** Sub-initiatives (#100): `null` desvincula do pai. Ciclo → 400. */
   parentId?: string | null;
}

/** Rótulos legíveis dos campos, para o feed de alterações (espelha o de project). */
const INITIATIVE_FIELD_LABELS: Partial<Record<keyof UpdateInitiativeInput, string>> = {
   name: 'name',
   status: 'status',
   priorityId: 'priority',
   healthId: 'health',
   ownerId: 'owner',
   target: 'target',
   startDate: 'start date',
   // O picker manda rótulo e data juntos: os dois viram um único "target" no feed.
   targetDate: 'target',
   projectIds: 'projects',
   labelIds: 'labels',
   parentId: 'parent initiative',
};

export async function updateInitiative(
   db: Db,
   id: string,
   patch: UpdateInitiativeInput,
   actorEmail?: string
): Promise<InitiativeDto | null> {
   const existing = await db.select({ id: initT.id }).from(initT).where(eq(initT.id, id)).limit(1);
   if (existing.length === 0) return null;
   const maps = await loadMaps(db);

   // Campos alterados que entram no feed, resolvidos ANTES da transação: o ator precisa
   // de uma consulta própria, e consultar `db` de dentro da `tx` trava (a conexão é uma só).
   const changed = [
      ...new Set(
         (Object.keys(patch) as (keyof UpdateInitiativeInput)[])
            .filter((k) => patch[k] !== undefined && INITIATIVE_FIELD_LABELS[k])
            .map((k) => INITIATIVE_FIELD_LABELS[k])
      ),
   ];
   const actorId =
      actorEmail && changed.length > 0 ? (await getOrCreateUser(db, actorEmail)).id : null;

   const set: Record<string, unknown> = {};
   for (const k of [
      'name',
      'description',
      'icon',
      'iconColor',
      'status',
      'priorityId',
      'healthId',
      'ownerId',
      'target',
      'startDate',
      'targetDate',
   ] as const) {
      if (patch[k] !== undefined) set[k] = patch[k];
   }
   // Cliente antigo (só o rótulo): mantém a data coerente com ele.
   if (patch.target !== undefined && patch.targetDate === undefined) {
      set.targetDate = targetDateFromLabel(patch.target);
   }
   if (patch.parentId !== undefined) {
      const parentId = patch.parentId?.trim() || null;
      if (parentId) await assertInitiativeParent(db, id, parentId);
      set.parentId = parentId;
   }
   await db.transaction(async (tx) => {
      if (Object.keys(set).length) await tx.update(initT).set(set).where(eq(initT.id, id));
      // Reconciliação initiative↔project: substitui o conjunto de vínculos e
      // mantém project.initiativeId dos dois lados sempre consistente.
      if (patch.projectIds !== undefined) {
         const old = await tx
            .select({ projectId: initiativeProject.projectId })
            .from(initiativeProject)
            .where(eq(initiativeProject.initiativeId, id));
         const oldIds = old.map((l) => l.projectId);
         await tx.delete(initiativeProject).where(eq(initiativeProject.initiativeId, id));
         // Limpa a back-reference dos projetos que apontavam para esta initiative.
         if (oldIds.length) {
            await tx
               .update(projectT)
               .set({ initiativeId: null })
               .where(and(inArray(projectT.id, oldIds), eq(projectT.initiativeId, id)));
         }
         if (patch.projectIds.length) {
            await tx
               .insert(initiativeProject)
               .values(patch.projectIds.map((projectId) => ({ initiativeId: id, projectId })))
               .onConflictDoNothing();
            await tx
               .update(projectT)
               .set({ initiativeId: id })
               .where(inArray(projectT.id, patch.projectIds));
         }
      }
      if (patch.labelIds !== undefined) {
         const labelIds = [...new Set(patch.labelIds)];
         const unknownLabelId = labelIds.find((labelId) => !maps.labels.has(labelId));
         if (unknownLabelId) throw new ApiError(400, `label '${unknownLabelId}' inválido`);
         await tx.delete(initiativeLabel).where(eq(initiativeLabel.initiativeId, id));
         if (labelIds.length) {
            await tx
               .insert(initiativeLabel)
               .values(labelIds.map((labelId) => ({ initiativeId: id, labelId })));
         }
      }

      // Feed de alterações: uma linha por update, resumindo os campos mudados.
      // Sem ator conhecido, não loga (mesma regra do updateProject).
      if (actorId) {
         await tx.insert(initiativeActivity).values({
            id: randomUUID(),
            initiativeId: id,
            userId: actorId,
            text: `changed ${changed.join(', ')}`,
            createdAt: new Date(),
         });
      }
   });
   publish({ entity: 'initiative', action: 'updated', id });
   return getInitiative(db, id);
}

export interface InitiativeActivityDto {
   id: string;
   user: UserRef | null;
   text: string;
   createdAt: string;
}

/** Feed de alterações da iniciativa, mais recente primeiro (espelha o de project). */
export async function listInitiativeActivity(
   db: Db,
   initiativeId: string
): Promise<InitiativeActivityDto[]> {
   const rows = await db
      .select()
      .from(initiativeActivity)
      .where(eq(initiativeActivity.initiativeId, initiativeId))
      .orderBy(desc(initiativeActivity.createdAt));
   if (rows.length === 0) return [];

   const userIds = [...new Set(rows.map((r) => r.userId))];
   const users = await db.select().from(appUser).where(inArray(appUser.id, userIds));
   const byId = new Map(users.map((u) => [u.id, u]));

   return rows.map((r) => {
      const u = byId.get(r.userId);
      return {
         id: r.id,
         user: u
            ? { id: u.id, slug: u.slug, name: u.name, email: u.email, avatarUrl: u.avatarUrl }
            : null,
         text: r.text,
         createdAt: r.createdAt.toISOString(),
      };
   });
}

export async function deleteInitiative(db: Db, id: string): Promise<boolean> {
   const existing = await db.select({ id: initT.id }).from(initT).where(eq(initT.id, id)).limit(1);
   if (existing.length === 0) return false;
   await db.transaction(async (tx) => {
      // Sub-initiatives (#100): as filhas sobem pro avô — o FK self-referente não
      // aceita pai inexistente.
      const [row] = await tx
         .select({ parentId: initT.parentId })
         .from(initT)
         .where(eq(initT.id, id))
         .limit(1);
      await tx
         .update(initT)
         .set({ parentId: row?.parentId ?? null })
         .where(eq(initT.parentId, id));
      await tx.delete(initiativeProject).where(eq(initiativeProject.initiativeId, id));
      await tx.delete(initiativeLabel).where(eq(initiativeLabel.initiativeId, id));
      // project.initiativeId é RESTRICT e nullable: desvincula os projetos antes de deletar.
      await tx.update(projectT).set({ initiativeId: null }).where(eq(projectT.initiativeId, id));
      await tx.delete(initT).where(eq(initT.id, id));
   });
   publish({ entity: 'initiative', action: 'deleted', id });
   return true;
}
