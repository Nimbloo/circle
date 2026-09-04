/**
 * Escopo de leitura por papel (#100).
 *
 * `Guest` só enxerga os times de que é membro (e os sub-times deles) e tudo que
 * pendura neles: issues, projects, initiatives, views, members, documentos. Todo
 * serviço de leitura recebe o escopo já resolvido — a filtragem é SERVER-SIDE, nunca
 * confiando na UI. Os demais papéis (Member/Admin/Application) não têm restrição:
 * `visibleTeamIds` devolve `null`, que significa "sem restrição".
 */
import { eq, or } from 'drizzle-orm';
import type { Db } from '@/db';
import { teamMember, issue as issueT, project as projectT } from '@/db/schema';
import { teamDescendantIds } from './hierarchy';
import { getOrCreateUser } from './users';
import { ApiError } from './errors';

/** O mínimo de um usuário para decidir escopo (aceita `UserRow` e `MeDto`). */
export interface ScopedUser {
   id: string;
   role: string;
}

export function isGuest(user: Pick<ScopedUser, 'role'>): boolean {
   return user.role === 'Guest';
}

/**
 * Times visíveis ao usuário, ou `null` quando não há restrição (Member/Admin).
 * Para um guest sem time nenhum devolve `[]` — "não vê nada", que é diferente de `null`.
 */
export async function visibleTeamIds(db: Db, user: ScopedUser): Promise<string[] | null> {
   if (!isGuest(user)) return null;
   const rows = await db
      .select({ teamId: teamMember.teamId })
      .from(teamMember)
      .where(eq(teamMember.userId, user.id));
   const direct = [...new Set(rows.map((r) => r.teamId))];
   if (direct.length === 0) return [];
   // Membro do pai enxerga os sub-times — coerente com "listas do pai incluem os filhos".
   return teamDescendantIds(db, direct);
}

/** `true` se o time está no escopo (escopo `null` = tudo visível). */
export function teamInScope(scope: string[] | null, teamId: string | null | undefined): boolean {
   if (scope === null) return true;
   return Boolean(teamId) && scope.includes(teamId as string);
}

/** 403 quando o recurso do time está fora do escopo do usuário. */
export function assertTeamInScope(scope: string[] | null, teamId: string | null | undefined): void {
   if (!teamInScope(scope, teamId)) throw new ApiError(403, 'Fora do seu escopo de acesso');
}

/**
 * Atalho para as rotas: resolve o usuário do e-mail da sessão e o escopo de times
 * de uma vez. `teamIds === null` = sem restrição (Member/Admin).
 */
export async function scopeForEmail(
   db: Db,
   email: string
): Promise<{ user: { id: string; role: string }; teamIds: string[] | null }> {
   const user = await getOrCreateUser(db, email);
   return { user, teamIds: await visibleTeamIds(db, user) };
}

/**
 * 403 quando a issue está fora do escopo (Guest). Aceita id interno OU identifier —
 * o detalhe é acessível pelos dois. No-op quando não há restrição.
 */
export async function assertIssueInScope(
   db: Db,
   scope: string[] | null,
   idOrIdentifier: string
): Promise<void> {
   if (scope === null) return;
   const rows = await db
      .select({ teamId: issueT.teamId })
      .from(issueT)
      .where(or(eq(issueT.id, idOrIdentifier), eq(issueT.identifier, idOrIdentifier))!)
      .limit(1);
   // Issue inexistente segue para o 404 do handler; só barramos o que existe e é de outro time.
   if (rows.length > 0) assertTeamInScope(scope, rows[0].teamId);
}

/** 403 quando o projeto está fora do escopo (Guest). No-op sem restrição. */
export async function assertProjectInScope(
   db: Db,
   scope: string[] | null,
   projectId: string
): Promise<void> {
   if (scope === null) return;
   const rows = await db
      .select({ teamId: projectT.teamId })
      .from(projectT)
      .where(eq(projectT.id, projectId))
      .limit(1);
   if (rows.length > 0) assertTeamInScope(scope, rows[0].teamId);
}

// ── Gate de ESCRITA (camada de serviço) ─────────────────────────────
/**
 * O escopo só protegia as rotas de LEITURA: toda escrita chegava ao serviço sem
 * checagem, e o serviço não conhecia escopo. Isto aqui é o gate que os SERVIÇOS chamam —
 * assim uma rota nova nasce protegida mesmo se o autor esquecer o assert no handler.
 *
 * O ator pode vir como e-mail (o serviço resolve) ou como escopo JÁ resolvido: quem
 * escreve em N entidades (import, dependências, lote de labels) resolve UMA vez e
 * repassa, em vez de uma query por entidade.
 */
export interface ActorScope {
   user: ScopedUser;
   /** `null` = sem restrição (Member/Admin/Application). */
   teamIds: string[] | null;
}

/** E-mail do ator ou escopo já resolvido. */
export type ScopeActor = string | ActorScope;

/** Resolve o escopo uma vez; `ActorScope` passa direto (sem query). */
export async function resolveActorScope(db: Db, actor: ScopeActor): Promise<ActorScope> {
   return typeof actor === 'string' ? scopeForEmail(db, actor) : actor;
}

/** 403 se o ator não pode escrever no time. Devolve o escopo para reaproveitamento. */
export async function assertCanWriteTeam(
   db: Db,
   actor: ScopeActor,
   teamId: string | null | undefined
): Promise<ActorScope> {
   const scope = await resolveActorScope(db, actor);
   assertTeamInScope(scope.teamIds, teamId);
   return scope;
}

/**
 * 403 se a issue existe e está fora do escopo do ator. Issue inexistente NÃO lança:
 * o handler segue para o 404 (contrato: 403 fora de escopo, 404 só quando não existe).
 */
export async function assertCanWriteIssue(
   db: Db,
   actor: ScopeActor,
   idOrIdentifier: string
): Promise<ActorScope> {
   const scope = await resolveActorScope(db, actor);
   await assertIssueInScope(db, scope.teamIds, idOrIdentifier);
   return scope;
}

/** 403 se o projeto existe e está fora do escopo do ator. */
export async function assertCanWriteProject(
   db: Db,
   actor: ScopeActor,
   projectId: string
): Promise<ActorScope> {
   const scope = await resolveActorScope(db, actor);
   await assertProjectInScope(db, scope.teamIds, projectId);
   return scope;
}

/**
 * 403 quando a initiative está fora do escopo. A initiative não tem time próprio: é
 * visível quando algum projeto da subárvore está num time visível — exatamente a regra
 * da listagem, reusada aqui (import tardio para não criar ciclo com `initiatives.ts`).
 */
export async function assertInitiativeInScope(
   db: Db,
   scope: string[] | null,
   initiativeId: string
): Promise<void> {
   if (scope === null) return;
   const { listInitiatives, getInitiative } = await import('./initiatives');
   // Inexistente segue para o 404 do handler; só barramos o que existe e é de fora.
   if (!(await getInitiative(db, initiativeId))) return;
   const visible = await listInitiatives(db, { teamIds: scope });
   if (!visible.some((i) => i.id === initiativeId))
      throw new ApiError(403, 'Fora do seu escopo de acesso');
}
