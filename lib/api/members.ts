import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser, teamMember } from '@/db/schema';
import { MEMBER_ROLES, type MemberRole } from '@/data/users';
import { ApiError } from './errors';
import { publish } from './events';

type UserRow = typeof appUser.$inferSelect;

export interface MemberDto {
   id: string;
   slug: string;
   name: string;
   email: string;
   avatarUrl: string | null;
   role: string;
   presence: string;
   timezone: string | null;
   joinedAt: string;
   teamCount: number;
   /** Times (ids/keys) dos quais o membro participa. */
   teamIds: string[];
   /** Desativado (#100): ISO da desativação, ou null se ativo. */
   deactivatedAt: string | null;
}

export type MemberSort = 'name' | 'joined' | 'teams';

function toDto(u: UserRow, teamIds: string[]): MemberDto {
   return {
      id: u.id,
      slug: u.slug,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
      role: u.role,
      presence: u.presence,
      timezone: u.timezone,
      joinedAt: u.joinedAt,
      teamCount: teamIds.length,
      teamIds,
      deactivatedAt: u.deactivatedAt ? u.deactivatedAt.toISOString() : null,
   };
}

/** Map userId -> lista de teamIds (a contagem deriva do length). */
async function teamMemberships(db: Db): Promise<Map<string, string[]>> {
   const rows = await db
      .select({ userId: teamMember.userId, teamId: teamMember.teamId })
      .from(teamMember);
   const map = new Map<string, string[]>();
   for (const r of rows) {
      const arr = map.get(r.userId);
      if (arr) arr.push(r.teamId);
      else map.set(r.userId, [r.teamId]);
   }
   return map;
}

export interface ListMembersOptions {
   role?: string[];
   sort?: MemberSort;
   dir?: 'asc' | 'desc';
   /**
    * Escopo de times (#100, Guest): só devolve quem participa de algum destes times.
    * `undefined` = sem restrição.
    */
   teamIds?: string[];
   /**
    * Inclui os desativados (#100). Default `false`: quem foi desligado sai da lista
    * no SERVIDOR, não só no filtro do componente. Quem realmente precisa deles (a
    * hidratação do workspace, para renderizar autoria/assignee histórico, e a tela de
    * membros com "Show deactivated") pede explicitamente.
    */
   includeDeactivated?: boolean;
}

export async function listMembers(db: Db, opts: ListMembersOptions = {}): Promise<MemberDto[]> {
   const [users, memberships] = await Promise.all([db.select().from(appUser), teamMemberships(db)]);
   let dtos = users.map((u) => toDto(u, memberships.get(u.id) ?? []));

   if (!opts.includeDeactivated) dtos = dtos.filter((d) => d.deactivatedAt === null);
   if (opts.role?.length) {
      const set = new Set(opts.role);
      dtos = dtos.filter((d) => set.has(d.role));
   }
   if (opts.teamIds) {
      const scope = new Set(opts.teamIds);
      dtos = dtos.filter((d) => d.teamIds.some((t) => scope.has(t)));
   }

   const dir = opts.dir === 'desc' ? -1 : 1;
   const by = opts.sort ?? 'name';
   dtos.sort((a, b) => {
      const cmp =
         by === 'teams'
            ? a.teamCount - b.teamCount
            : by === 'joined'
              ? a.joinedAt.localeCompare(b.joinedAt)
              : a.name.localeCompare(b.name);
      return cmp * dir;
   });
   return dtos;
}

export async function getMember(db: Db, id: string): Promise<MemberDto | null> {
   const rows = await db.select().from(appUser).where(eq(appUser.id, id)).limit(1);
   if (rows.length === 0) return null;
   const memberships = await teamMemberships(db);
   return toDto(rows[0], memberships.get(id) ?? []);
}

// Fonte única em data/users (módulo puro, compartilhado com o client);
// o re-export mantém o contrato deste módulo para as rotas da API.
export { MEMBER_ROLES, type MemberRole };

/**
 * 409 se tirar o papel `Admin` deste usuário deixaria o workspace sem NENHUM
 * administrador ativo. Sem isto, o último admin se rebaixa (ou é rebaixado) e ninguém
 * mais consegue gerir papéis, times, tokens ou webhooks — só um `UPDATE` manual no
 * banco reabriria. Só conta admin ativo: desativado não administra nada.
 */
async function assertNotLastAdmin(db: Db, id: string): Promise<void> {
   const [target] = await db
      .select({ role: appUser.role })
      .from(appUser)
      .where(eq(appUser.id, id))
      .limit(1);
   if (!target || target.role !== 'Admin') return;
   const others = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(and(eq(appUser.role, 'Admin'), ne(appUser.id, id), isNull(appUser.deactivatedAt))!)
      .limit(1);
   if (others.length === 0)
      throw new ApiError(409, 'O workspace precisa de pelo menos um administrador ativo');
}

/**
 * 400 quando algum dos ids indicados é de usuário desativado (#100). Usado por quem
 * aceita `assigneeId`/`assigneeIds`/`leadId`: desligar alguém não pode conviver com
 * continuar atribuindo trabalho a ele. Ids inexistentes seguem para o 404/FK do serviço.
 */
export async function assertAssignableUsers(
   db: Db,
   ids: (string | null | undefined)[]
): Promise<void> {
   const wanted = [...new Set(ids.filter((v): v is string => Boolean(v)))];
   if (wanted.length === 0) return;
   const rows = await db
      .select({ id: appUser.id, name: appUser.name, deactivatedAt: appUser.deactivatedAt })
      .from(appUser)
      .where(inArray(appUser.id, wanted));
   const off = rows.filter((r) => r.deactivatedAt !== null);
   if (off.length > 0)
      throw new ApiError(
         400,
         `Usuário desativado não pode receber atribuição: ${off.map((o) => o.name).join(', ')}`
      );
}

/** Atualiza a role do membro (valida o enum). Retorna o MemberDto ou null se não existir. */
export async function updateMemberRole(
   db: Db,
   id: string,
   role: string
): Promise<MemberDto | null> {
   if (!MEMBER_ROLES.includes(role as MemberRole))
      throw new ApiError(400, `Role inválida: '${role}' (use ${MEMBER_ROLES.join('|')})`);
   const existing = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.id, id))
      .limit(1);
   if (existing.length === 0) return null;
   if (role !== 'Admin') await assertNotLastAdmin(db, id);
   await db.update(appUser).set({ role, updatedAt: new Date() }).where(eq(appUser.id, id));
   publish({ entity: 'member', action: 'updated', id });
   return getMember(db, id);
}

/**
 * Papel de quem é desativado. `Guest` sem time nenhum = escopo VAZIO (`visibleTeamIds`
 * devolve `[]`), enquanto `Member` é escopo IRRESTRITO — por isso desativar chegava a
 * AMPLIAR o alcance: saía dos times e continuava enxergando tudo. O 403 do ator já
 * fecha o buraco; o rebaixamento é a segunda barreira, para não depender de um ponto só.
 *
 * Reativar NÃO restaura o papel anterior (não guardamos histórico de papel): o admin
 * volta a conceder Member/Admin explicitamente, que é o comportamento seguro.
 */
const DEACTIVATED_ROLE = 'Guest';

/**
 * Desativa um membro (#100): marca `deactivated_at`, rebaixa o papel, remove de TODOS
 * os times e bloqueia o login (`login-gate`) e toda chamada de API (`requireEmail` /
 * `getOrCreateUser`). O histórico (autoria de issues, activity) fica intacto — nada é
 * apagado. Idempotente: re-desativar mantém a data original.
 */
export async function setMemberDeactivated(
   db: Db,
   id: string,
   deactivated: boolean
): Promise<MemberDto | null> {
   const rows = await db.select().from(appUser).where(eq(appUser.id, id)).limit(1);
   if (rows.length === 0) return null;
   const current = rows[0];
   if (deactivated) {
      if (!current.deactivatedAt) {
         await assertNotLastAdmin(db, id);
         await db
            .update(appUser)
            .set({ deactivatedAt: new Date(), role: DEACTIVATED_ROLE, updatedAt: new Date() })
            .where(eq(appUser.id, id));
      }
      // Sai dos times: sem isto ele seguiria contando como membro e aparecendo nas
      // listas por time mesmo sem conseguir entrar.
      await db.delete(teamMember).where(eq(teamMember.userId, id));
   } else if (current.deactivatedAt) {
      await db
         .update(appUser)
         .set({ deactivatedAt: null, updatedAt: new Date() })
         .where(eq(appUser.id, id));
   }
   publish({ entity: 'member', action: 'updated', id });
   return getMember(db, id);
}

/** `true` se o e-mail pertence a um usuário desativado (gate de login). */
export async function isDeactivatedEmail(db: Db, email: string): Promise<boolean> {
   const rows = await db
      .select({ deactivatedAt: appUser.deactivatedAt })
      .from(appUser)
      .where(eq(appUser.email, email.trim().toLowerCase()))
      .limit(1);
   return rows.length > 0 && rows[0].deactivatedAt !== null;
}
