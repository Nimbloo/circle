import { randomUUID } from 'node:crypto';
import { eq, count, and } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   team as teamT,
   teamMember,
   teamJoinRequest,
   appUser,
   project as projectT,
   issue as issueT,
   cycle as cycleT,
   savedView as savedViewT,
   documentFolder as documentFolderT,
} from '@/db/schema';
import { getOrCreateUser, generateInviteToken, signupUrl } from './users';
import { sendEmail } from './integrations/mailer';
import { ctaEmailHtml } from './integrations/email-templates';
import { escapeHtml } from './notify';
import { ApiError } from './errors';
import { publish } from './events';

type TeamRow = typeof teamT.$inferSelect;

export interface TeamDto {
   id: string;
   name: string;
   icon: string | null;
   color: string | null;
   memberCount: number;
   projectCount: number;
   joined: boolean;
   requested: boolean; // o usuário atual tem solicitação de entrada PENDENTE
}

export type TeamSort = 'name' | 'members' | 'projects';

async function countsByTeam(db: Db) {
   const [memberCounts, projectCounts] = await Promise.all([
      db
         .select({ teamId: teamMember.teamId, n: count() })
         .from(teamMember)
         .groupBy(teamMember.teamId),
      db.select({ teamId: projectT.teamId, n: count() }).from(projectT).groupBy(projectT.teamId),
   ]);
   return {
      members: new Map(memberCounts.map((r) => [r.teamId, Number(r.n)])),
      projects: new Map(projectCounts.map((r) => [r.teamId, Number(r.n)])),
   };
}

async function joinedTeamIds(db: Db, userId?: string): Promise<Set<string>> {
   if (!userId) return new Set();
   const rows = await db
      .select({ teamId: teamMember.teamId })
      .from(teamMember)
      .where(eq(teamMember.userId, userId));
   return new Set(rows.map((r) => r.teamId));
}

function toDto(
   t: TeamRow,
   counts: { members: Map<string, number>; projects: Map<string, number> },
   joined: Set<string>,
   requested?: Set<string>
): TeamDto {
   return {
      id: t.id,
      name: t.name,
      icon: t.icon,
      color: t.color,
      memberCount: counts.members.get(t.id) ?? 0,
      projectCount: counts.projects.get(t.id) ?? 0,
      joined: joined.has(t.id),
      requested: requested?.has(t.id) ?? false,
   };
}

export interface ListTeamsOptions {
   membership?: string[]; // 'Joined' | 'Not-Joined'
   sort?: TeamSort;
   dir?: 'asc' | 'desc';
}

export async function listTeams(
   db: Db,
   opts: ListTeamsOptions = {},
   meId?: string
): Promise<TeamDto[]> {
   const [teams, counts, joined, requested] = await Promise.all([
      db.select().from(teamT),
      countsByTeam(db),
      joinedTeamIds(db, meId),
      pendingRequestTeamIds(db, meId),
   ]);
   const requestedSet = new Set(requested);
   let dtos = teams.map((t) => toDto(t, counts, joined, requestedSet));

   if (opts.membership?.length) {
      const wantJoined = opts.membership.includes('Joined');
      const wantNot = opts.membership.includes('Not-Joined');
      dtos = dtos.filter((d) => (d.joined && wantJoined) || (!d.joined && wantNot));
   }

   const dir = opts.dir === 'desc' ? -1 : 1;
   const by = opts.sort ?? 'name';
   dtos.sort((a, b) => {
      const cmp =
         by === 'members'
            ? a.memberCount - b.memberCount
            : by === 'projects'
              ? a.projectCount - b.projectCount
              : a.name.localeCompare(b.name);
      return cmp * dir;
   });
   return dtos;
}

export async function getTeam(db: Db, id: string, meId?: string): Promise<TeamDto | null> {
   const rows = await db.select().from(teamT).where(eq(teamT.id, id)).limit(1);
   if (rows.length === 0) return null;
   const [counts, joined, requested] = await Promise.all([
      countsByTeam(db),
      joinedTeamIds(db, meId),
      pendingRequestTeamIds(db, meId),
   ]);
   return toDto(rows[0], counts, joined, new Set(requested));
}

export async function listTeamMembers(db: Db, teamId: string) {
   return db
      .select({
         id: appUser.id,
         slug: appUser.slug,
         name: appUser.name,
         email: appUser.email,
         avatarUrl: appUser.avatarUrl,
         role: appUser.role,
      })
      .from(teamMember)
      .innerJoin(appUser, eq(teamMember.userId, appUser.id))
      .where(eq(teamMember.teamId, teamId));
}

export interface CreateTeamInput {
   id: string;
   name: string;
   icon?: string | null;
   color?: string | null;
}

/**
 * Cria um time. A key (id) vira o prefixo do identifier das issues (<KEY>-<n>).
 * O CRIADOR entra automaticamente como membro — senão o time nasce órfão (0 membros)
 * e ninguém consegue entrar, já que join direto exige aprovação de admin (request-to-join).
 */
export async function createTeam(
   db: Db,
   input: CreateTeamInput,
   creatorEmail?: string
): Promise<TeamDto> {
   const id = input.id.trim().toUpperCase();
   if (!/^[A-Z][A-Z0-9]{1,15}$/.test(id))
      throw new ApiError(
         400,
         "Key inválida (2-16 letras/números começando por letra, ex.: 'CORE')"
      );
   const existing = await db.select({ id: teamT.id }).from(teamT).where(eq(teamT.id, id)).limit(1);
   if (existing.length) throw new ApiError(409, `Team '${id}' já existe`);
   await db.insert(teamT).values({
      id,
      name: input.name.trim(),
      icon: input.icon?.trim() || '📋',
      color: input.color?.trim() || '#6e7bdb',
      issueSeq: 0,
   });
   let creatorId: string | undefined;
   if (creatorEmail) {
      const creator = await getOrCreateUser(db, creatorEmail);
      creatorId = creator.id;
      await db
         .insert(teamMember)
         .values({ teamId: id, userId: creator.id, joined: true })
         .onConflictDoNothing();
   }
   publish({ entity: 'team', action: 'created', id });
   return (await getTeam(db, id, creatorId))!;
}

/** Adiciona (idempotente) um membro ao time pelo e-mail — provisiona o usuário se novo. */
export async function addTeamMember(db: Db, teamId: string, email: string): Promise<void> {
   const t = await db
      .select({ id: teamT.id, name: teamT.name })
      .from(teamT)
      .where(eq(teamT.id, teamId))
      .limit(1);
   if (!t.length) throw new ApiError(404, `Team '${teamId}' não existe`);
   const user = await getOrCreateUser(db, email);
   const inserted = await db
      .insert(teamMember)
      .values({ teamId, userId: user.id, joined: true })
      .onConflictDoNothing()
      .returning();
   if (inserted.length) publish({ entity: 'member', action: 'updated', id: user.id });

   // E-mail (best-effort): só em inserção nova e com remetente configurado. Conta
   // ATIVA (tem senha) → notificação simples "entrou no time"; conta PENDENTE (sem
   // senha) → convite TOKENIZADO com link de signup (antes mandava um "adicionado"
   // sem ação — o usuário novo não tinha como ativar a conta).
   if (inserted.length && process.env.CIRCLE_MAIL_FROM) {
      try {
         const teamName = t[0].name;
         if (user.passwordHash) {
            await sendEmail(
               user.email,
               `Você entrou no time ${teamName}`,
               ctaEmailHtml({
                  title: `Você foi adicionado ao time ${teamName}`,
                  intro: `Agora você faz parte do time ${teamName} no Circle.`,
                  buttonLabel: 'Abrir o Circle',
                  buttonUrl: 'https://circle.nimbloo.ai',
               })
            );
         } else {
            let token = user.inviteToken;
            if (!token) {
               token = generateInviteToken();
               await db
                  .update(appUser)
                  .set({ inviteToken: token, updatedAt: new Date() })
                  .where(eq(appUser.id, user.id));
            }
            await sendEmail(
               user.email,
               `Seu convite para o time ${teamName}`,
               ctaEmailHtml({
                  title: `Convite para o time ${teamName}`,
                  intro: `Você foi convidado para o time ${teamName} no Circle. Defina sua senha para ativar sua conta.`,
                  buttonLabel: 'Definir minha senha',
                  buttonUrl: signupUrl(user.email, token),
               })
            );
         }
      } catch (err) {
         console.error('[circle] convite de time por e-mail falhou:', err);
      }
   }
}

/** Remove um membro do time. */
export async function removeTeamMember(db: Db, teamId: string, userId: string): Promise<void> {
   await db
      .delete(teamMember)
      .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)));
   publish({ entity: 'member', action: 'updated', id: userId });
}

// ── Request-to-join (Linear-style) ───────────────────────────────────────────
// Pra entrar num time: OU um admin adiciona (addTeamMember, convite), OU o usuário
// SOLICITA e um admin aprova. Sem self-join direto — evita que qualquer um entre em
// qualquer time. `leaveTeam` (self) é livre.

export interface JoinRequestDto {
   id: string;
   teamId: string;
   status: string;
   createdAt: string;
   user: { id: string; name: string; email: string; avatarUrl: string | null };
}

/** True se o usuário já é membro do time. */
async function isTeamMember(db: Db, teamId: string, userId: string): Promise<boolean> {
   const rows = await db
      .select({ userId: teamMember.userId })
      .from(teamMember)
      .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
      .limit(1);
   return rows.length > 0;
}

/**
 * Usuário solicita entrada num time. Idempotente: 1 linha por (team,user) — re-pedido
 * (após negação) volta pra `pending`. 409 se já for membro. Notifica admins best-effort.
 */
export async function requestToJoin(
   db: Db,
   teamId: string,
   email: string
): Promise<{ status: 'pending' }> {
   const t = await db
      .select({ id: teamT.id, name: teamT.name })
      .from(teamT)
      .where(eq(teamT.id, teamId))
      .limit(1);
   if (!t.length) throw new ApiError(404, `Team '${teamId}' não existe`);
   const user = await getOrCreateUser(db, email);
   if (await isTeamMember(db, teamId, user.id))
      throw new ApiError(409, 'Você já é membro deste time');
   await db
      .insert(teamJoinRequest)
      .values({ id: randomUUID(), teamId, userId: user.id, status: 'pending' })
      .onConflictDoUpdate({
         target: [teamJoinRequest.teamId, teamJoinRequest.userId],
         set: { status: 'pending', createdAt: new Date(), decidedAt: null, decidedBy: null },
      });
   publish({ entity: 'member', action: 'updated', id: user.id });
   notifyAdminsOfJoinRequest(t[0].name, user.name).catch(() => {});
   return { status: 'pending' };
}

/** Lista as solicitações PENDENTES de um time (admin). */
export async function listJoinRequests(db: Db, teamId: string): Promise<JoinRequestDto[]> {
   const rows = await db
      .select({
         id: teamJoinRequest.id,
         teamId: teamJoinRequest.teamId,
         status: teamJoinRequest.status,
         createdAt: teamJoinRequest.createdAt,
         uid: appUser.id,
         name: appUser.name,
         email: appUser.email,
         avatarUrl: appUser.avatarUrl,
      })
      .from(teamJoinRequest)
      .innerJoin(appUser, eq(teamJoinRequest.userId, appUser.id))
      .where(and(eq(teamJoinRequest.teamId, teamId), eq(teamJoinRequest.status, 'pending')));
   return rows.map((r) => ({
      id: r.id,
      teamId: r.teamId,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      user: { id: r.uid, name: r.name, email: r.email, avatarUrl: r.avatarUrl },
   }));
}

/** Aprova/nega uma solicitação (admin). Aprovar insere o team_member (idempotente). */
export async function decideJoinRequest(
   db: Db,
   teamId: string,
   requestId: string,
   decision: 'approved' | 'denied',
   deciderId: string
): Promise<void> {
   const rows = await db
      .select()
      .from(teamJoinRequest)
      .where(and(eq(teamJoinRequest.id, requestId), eq(teamJoinRequest.teamId, teamId)))
      .limit(1);
   if (!rows.length) throw new ApiError(404, 'Solicitação não encontrada');
   if (rows[0].status !== 'pending') throw new ApiError(409, 'Solicitação já foi decidida');
   if (decision === 'approved') {
      await db
         .insert(teamMember)
         .values({ teamId, userId: rows[0].userId, joined: true })
         .onConflictDoNothing();
   }
   await db
      .update(teamJoinRequest)
      .set({ status: decision, decidedAt: new Date(), decidedBy: deciderId })
      .where(eq(teamJoinRequest.id, requestId));
   publish({ entity: 'member', action: 'updated', id: rows[0].userId });
}

/** teamIds com solicitação PENDENTE do usuário — pra UI mostrar "Solicitado". */
export async function pendingRequestTeamIds(db: Db, userId?: string): Promise<string[]> {
   if (!userId) return [];
   const rows = await db
      .select({ teamId: teamJoinRequest.teamId })
      .from(teamJoinRequest)
      .where(and(eq(teamJoinRequest.userId, userId), eq(teamJoinRequest.status, 'pending')));
   return rows.map((r) => r.teamId);
}

/** E-mail best-effort pros admins (allowlist) quando alguém solicita entrada. */
async function notifyAdminsOfJoinRequest(teamName: string, requesterName: string): Promise<void> {
   if (!process.env.CIRCLE_MAIL_FROM) return;
   const admins = (process.env.CIRCLE_ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
   if (!admins.length) return;
   const html =
      `<p><strong>${escapeHtml(requesterName)}</strong> solicitou entrada no time ` +
      `<strong>${escapeHtml(teamName)}</strong> no Circle.</p>` +
      `<p><a href="https://circle.nimbloo.ai">Revisar solicitações</a></p>`;
   await Promise.allSettled(
      admins.map((a) => sendEmail(a, `Solicitação de entrada: ${teamName}`, html))
   );
}

export interface UpdateTeamInput {
   name?: string;
   icon?: string | null;
   color?: string | null;
}

/** Atualização parcial (name/icon/color). Retorna o TeamDto ou null se não existir. */
export async function updateTeam(
   db: Db,
   id: string,
   patch: UpdateTeamInput
): Promise<TeamDto | null> {
   const existing = await db.select({ id: teamT.id }).from(teamT).where(eq(teamT.id, id)).limit(1);
   if (existing.length === 0) return null;
   const set: Record<string, unknown> = {};
   if (patch.name !== undefined) set.name = patch.name.trim();
   if (patch.icon !== undefined) set.icon = patch.icon;
   if (patch.color !== undefined) set.color = patch.color;
   if (Object.keys(set).length) await db.update(teamT).set(set).where(eq(teamT.id, id));
   publish({ entity: 'team', action: 'updated', id });
   return getTeam(db, id);
}

/**
 * Apaga um time. Escolha segura: recusa com 409 se o time tiver issues, projects,
 * cycles, saved views ou document folders (todos com FK RESTRICT — evita 500/órfãos).
 * Se estiver vazio, remove os team_member e o team. Retorna false se o time não existir.
 */
export async function deleteTeam(db: Db, id: string): Promise<boolean> {
   const existing = await db.select({ id: teamT.id }).from(teamT).where(eq(teamT.id, id)).limit(1);
   if (existing.length === 0) return false;

   const [issues, projects, cycles, views, folders] = await Promise.all([
      db.select({ n: count() }).from(issueT).where(eq(issueT.teamId, id)),
      db.select({ n: count() }).from(projectT).where(eq(projectT.teamId, id)),
      db.select({ n: count() }).from(cycleT).where(eq(cycleT.teamId, id)),
      db.select({ n: count() }).from(savedViewT).where(eq(savedViewT.teamId, id)),
      db.select({ n: count() }).from(documentFolderT).where(eq(documentFolderT.teamId, id)),
   ]);
   const total =
      Number(issues[0].n) +
      Number(projects[0].n) +
      Number(cycles[0].n) +
      Number(views[0].n) +
      Number(folders[0].n);
   if (total > 0)
      throw new ApiError(
         409,
         `Team '${id}' tem issues/projects/cycles/views/folders — esvazie antes de apagar`
      );

   await db.delete(teamMember).where(eq(teamMember.teamId, id));
   await db.delete(teamT).where(eq(teamT.id, id));
   publish({ entity: 'team', action: 'deleted', id });
   return true;
}
