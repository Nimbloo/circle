import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   activityEvent,
   appUser,
   issue as issueT,
   issueAssignee,
   issueLabel,
   label as labelT,
   teamAutomation,
   team as teamT,
} from '@/db/schema';
import { recordAudit } from './audit';
import { getCachedCatalogs } from './catalogs';
import { ApiError } from './errors';
import { publish } from './events';
import { applySla } from './slas';

/**
 * Automações por time (#97). Uma regra = um gatilho + uma ação com parâmetros
 * (`config`). O motor (`runAutomations`) é chamado de `createIssue`, `updateIssue`,
 * `addLabel` e do webhook do GitHub (PR mergeado).
 *
 * As ações escrevem DIRETO nas tabelas (não via `updateIssue`) e re-disparam o gatilho
 * correspondente de forma controlada: assim o encadeamento existe, mas com anti-loop
 * (uma regra não roda duas vezes na mesma cadeia) e profundidade máxima.
 */

export const AUTOMATION_TRIGGERS = [
   'issue.created_in_triage',
   'issue.status_changed',
   'issue.label_added',
   'pr.merged',
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

export const AUTOMATION_ACTIONS = [
   'add_label',
   'set_status',
   'set_priority',
   'set_assignee',
   'close_sub_issues',
] as const;
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];

/** Profundidade máxima do encadeamento (uma regra que dispara outra que dispara outra). */
export const MAX_AUTOMATION_DEPTH = 3;

export interface AutomationConfig {
   /** `issue.status_changed`: só dispara quando a issue entra nesta categoria. */
   toCategory?: string | null;
   /** `issue.label_added`: label que dispara a regra. */
   triggerLabelId?: string | null;
   /** `add_label`: label aplicada pela AÇÃO (chave distinta do gatilho, de propósito). */
   labelId?: string | null;
   /** `set_status`. */
   statusId?: string | null;
   /** `set_priority`. */
   priorityId?: string | null;
   /** `set_assignee`. */
   assigneeId?: string | null;
}

export interface TeamAutomationDto {
   id: string;
   teamId: string;
   name: string;
   trigger: AutomationTrigger;
   action: AutomationAction;
   config: AutomationConfig;
   enabled: boolean;
   position: number;
   createdAt: string;
}

type Row = typeof teamAutomation.$inferSelect;

function toDto(row: Row): TeamAutomationDto {
   return {
      id: row.id,
      teamId: row.teamId,
      name: row.name,
      trigger: row.trigger as AutomationTrigger,
      action: row.action as AutomationAction,
      config: (row.config as AutomationConfig | null) ?? {},
      enabled: row.enabled,
      position: row.position,
      createdAt:
         row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
   };
}

/* ------------------------------------ CRUD ------------------------------------ */

/**
 * Regra default do PR mergeado: antes da #97 isso era um fluxo FIXO no sync de reviews;
 * agora é uma regra visível e editável. Semeada de forma lazy (sem CronJob nem backfill)
 * na primeira leitura/execução do time.
 *
 * A semeadura acontece UMA VEZ por time, marcada em `team.automations_seeded_at`. Antes
 * a decisão era "o time tem alguma regra?", então apagar todas ressuscitava a regra
 * padrão na leitura seguinte — apagar não apagava. O `UPDATE … WHERE seeded IS NULL`
 * é a trava: só quem conseguir marcar o time (uma transação, uma linha) semeia.
 */
export async function ensureDefaultAutomations(db: Db, teamId: string): Promise<void> {
   const claimed = await db
      .update(teamT)
      .set({ automationsSeededAt: new Date() })
      .where(and(eq(teamT.id, teamId), isNull(teamT.automationsSeededAt)))
      .returning({ id: teamT.id });
   if (claimed.length === 0) return; // time inexistente ou já semeado

   const done = await defaultCompletedStatusId(db);
   if (!done) {
      // Catálogo ainda não semeado: devolve a marca para tentar de novo depois.
      await db.update(teamT).set({ automationsSeededAt: null }).where(eq(teamT.id, teamId));
      return;
   }
   await db.insert(teamAutomation).values({
      id: randomUUID(),
      teamId,
      name: 'PR merged → Done',
      trigger: 'pr.merged',
      action: 'set_status',
      config: { statusId: done },
      enabled: true,
      position: 0,
      createdAt: new Date(),
   });
}

export async function listTeamAutomations(db: Db, teamId: string): Promise<TeamAutomationDto[]> {
   await ensureDefaultAutomations(db, teamId);
   const rows = await db
      .select()
      .from(teamAutomation)
      .where(eq(teamAutomation.teamId, teamId))
      .orderBy(asc(teamAutomation.position), asc(teamAutomation.createdAt));
   return rows.map(toDto);
}

export interface CreateAutomationInput {
   name: string;
   trigger: AutomationTrigger;
   action: AutomationAction;
   config?: AutomationConfig;
   enabled?: boolean;
}

export type UpdateAutomationInput = Partial<CreateAutomationInput> & { position?: number };

/** Valida os parâmetros exigidos pelo par (gatilho, ação) — 400 quando faltam. */
function validateConfig(
   trigger: AutomationTrigger,
   action: AutomationAction,
   config: AutomationConfig
): void {
   if (trigger === 'issue.label_added' && !config.triggerLabelId)
      throw new ApiError(400, 'O gatilho "label adicionada" exige uma label');
   const required: Partial<Record<AutomationAction, keyof AutomationConfig>> = {
      add_label: 'labelId',
      set_status: 'statusId',
      set_priority: 'priorityId',
      set_assignee: 'assigneeId',
   };
   const field = required[action];
   if (field && !config[field]) throw new ApiError(400, `A ação exige o parâmetro '${field}'`);
}

export async function createAutomation(
   db: Db,
   teamId: string,
   input: CreateAutomationInput
): Promise<TeamAutomationDto> {
   const [team] = await db
      .select({ id: teamT.id })
      .from(teamT)
      .where(eq(teamT.id, teamId))
      .limit(1);
   if (!team) throw new ApiError(404, `Team '${teamId}' não encontrado`);
   if (!AUTOMATION_TRIGGERS.includes(input.trigger))
      throw new ApiError(400, `Gatilho '${input.trigger}' inválido`);
   if (!AUTOMATION_ACTIONS.includes(input.action))
      throw new ApiError(400, `Ação '${input.action}' inválida`);
   const config = input.config ?? {};
   validateConfig(input.trigger, input.action, config);

   const rows = await db
      .select({ position: teamAutomation.position })
      .from(teamAutomation)
      .where(eq(teamAutomation.teamId, teamId));
   const position = rows.reduce((max, r) => Math.max(max, r.position), -1) + 1;
   const row: Row = {
      id: randomUUID(),
      teamId,
      name: input.name.trim() || 'Automation',
      trigger: input.trigger,
      action: input.action,
      config,
      enabled: input.enabled ?? true,
      position,
      createdAt: new Date(),
   };
   await db.insert(teamAutomation).values(row);
   return toDto(row);
}

export async function updateAutomation(
   db: Db,
   id: string,
   patch: UpdateAutomationInput
): Promise<TeamAutomationDto | null> {
   const [prev] = await db.select().from(teamAutomation).where(eq(teamAutomation.id, id)).limit(1);
   if (!prev) return null;
   const trigger = (patch.trigger ?? prev.trigger) as AutomationTrigger;
   const action = (patch.action ?? prev.action) as AutomationAction;
   const config = patch.config ?? (prev.config as AutomationConfig | null) ?? {};
   validateConfig(trigger, action, config);

   const set: Partial<Row> = { trigger, action, config };
   if (patch.name !== undefined) set.name = patch.name.trim() || prev.name;
   if (patch.enabled !== undefined) set.enabled = patch.enabled;
   if (patch.position !== undefined) set.position = patch.position;
   await db.update(teamAutomation).set(set).where(eq(teamAutomation.id, id));
   return toDto({ ...prev, ...set });
}

export async function deleteAutomation(db: Db, id: string): Promise<boolean> {
   const deleted = await db
      .delete(teamAutomation)
      .where(eq(teamAutomation.id, id))
      .returning({ id: teamAutomation.id });
   return deleted.length > 0;
}

/* ----------------------------------- motor ----------------------------------- */

export interface AutomationRunContext {
   /** null = sistema (webhook do GitHub): a activity aparece como usuário sintético. */
   actorId: string | null;
   actorEmail?: string;
   /** Label recém-adicionada (gatilho `issue.label_added`). */
   labelId?: string;
   /** Categoria em que a issue entrou (gatilho `issue.status_changed`). */
   toCategory?: string;
   /** Regras já executadas nesta cadeia (anti-loop). */
   chain?: readonly string[];
   /** Profundidade do encadeamento (0 = disparo original). */
   depth?: number;
}

interface TargetIssue {
   id: string;
   teamId: string;
   statusId: string;
   priorityId: string;
   assigneeId: string | null;
   startedAt: Date | null;
   dueDate: string | null;
   slaAppliedAt: Date | null;
}

async function loadIssue(db: Db, id: string): Promise<TargetIssue | null> {
   const [row] = await db
      .select({
         id: issueT.id,
         teamId: issueT.teamId,
         statusId: issueT.statusId,
         priorityId: issueT.priorityId,
         assigneeId: issueT.assigneeId,
         startedAt: issueT.startedAt,
         dueDate: issueT.dueDate,
         slaAppliedAt: issueT.slaAppliedAt,
      })
      .from(issueT)
      .where(eq(issueT.id, id))
      .limit(1);
   return row ?? null;
}

async function defaultCompletedStatusId(db: Db): Promise<string | null> {
   const { statuses } = await getCachedCatalogs(db);
   const done = statuses
      .filter((s) => s.category === 'completed')
      .sort((a, b) => a.position - b.position)[0];
   return done?.id ?? null;
}

async function logRun(
   db: Db,
   rule: TeamAutomationDto,
   issueId: string,
   ctx: AutomationRunContext,
   detail: string
): Promise<void> {
   await db.insert(activityEvent).values({
      id: randomUUID(),
      issueId,
      actorId: ctx.actorId,
      event: 'automation',
      text: `automation: ${rule.name} — ${detail}`,
      createdAt: new Date(),
   });
   await recordAudit(db, {
      actorId: ctx.actorId,
      action: 'automation.run',
      targetType: 'issue',
      targetId: issueId,
      meta: {
         automationId: rule.id,
         name: rule.name,
         trigger: rule.trigger,
         action: rule.action,
         teamId: rule.teamId,
      },
   });
}

/** A regra casa com o disparo atual? (parâmetros do GATILHO, não da ação.) */
function matchesTrigger(rule: TeamAutomationDto, ctx: AutomationRunContext): boolean {
   if (rule.trigger === 'issue.label_added')
      return !!rule.config.triggerLabelId && rule.config.triggerLabelId === ctx.labelId;
   if (rule.trigger === 'issue.status_changed')
      return !rule.config.toCategory || rule.config.toCategory === ctx.toCategory;
   return true;
}

/**
 * Roda as automações do time para um gatilho. Devolve quantas regras foram aplicadas.
 *
 * Best-effort de VERDADE: o motor inteiro é envolvido, não só o laço. Os chamadores
 * (`createIssue`, `updateIssue`, `addLabel`, webhook do GitHub) fazem `await` sem
 * try/catch, então qualquer falha ANTES do laço — carregar a issue, semear as regras
 * padrão, o SELECT das regras — derrubava o POST/PATCH inteiro. Automação é efeito
 * colateral: nunca pode custar a mutação que a disparou.
 */
export async function runAutomations(
   db: Db,
   trigger: AutomationTrigger,
   issueId: string,
   ctx: AutomationRunContext
): Promise<number> {
   try {
      return await runAutomationsUnsafe(db, trigger, issueId, ctx);
   } catch (e) {
      console.warn(`[circle] motor de automações falhou (${issueId}):`, (e as Error).message);
      return 0;
   }
}

async function runAutomationsUnsafe(
   db: Db,
   trigger: AutomationTrigger,
   issueId: string,
   ctx: AutomationRunContext
): Promise<number> {
   const depth = ctx.depth ?? 0;
   if (depth >= MAX_AUTOMATION_DEPTH) return 0;
   const target = await loadIssue(db, issueId);
   if (!target) return 0;
   await ensureDefaultAutomations(db, target.teamId);

   const rows = await db
      .select()
      .from(teamAutomation)
      .where(
         and(
            eq(teamAutomation.teamId, target.teamId),
            eq(teamAutomation.trigger, trigger),
            eq(teamAutomation.enabled, true)
         )
      )
      .orderBy(asc(teamAutomation.position), asc(teamAutomation.createdAt));

   const chain = ctx.chain ?? [];
   let applied = 0;
   for (const row of rows) {
      const rule = toDto(row);
      // Anti-loop: a mesma regra nunca roda duas vezes na mesma cadeia.
      if (chain.includes(rule.id)) continue;
      if (!matchesTrigger(rule, ctx)) continue;
      try {
         const ran = await applyAction(db, rule, issueId, {
            ...ctx,
            depth,
            chain: [...chain, rule.id],
         });
         if (ran) applied += 1;
      } catch (e) {
         console.warn(`[circle] automação '${rule.name}' falhou:`, (e as Error).message);
      }
   }
   return applied;
}

/** Executa a ação da regra. Devolve false quando não havia nada a fazer (idempotente). */
async function applyAction(
   db: Db,
   rule: TeamAutomationDto,
   issueId: string,
   ctx: AutomationRunContext
): Promise<boolean> {
   const target = await loadIssue(db, issueId);
   if (!target) return false;
   const now = new Date();
   const nextDepth = (ctx.depth ?? 0) + 1;
   const chain = ctx.chain ?? [];

   switch (rule.action) {
      case 'add_label': {
         const labelId = rule.config.labelId!;
         const [exists] = await db
            .select({ id: labelT.id })
            .from(labelT)
            .where(eq(labelT.id, labelId))
            .limit(1);
         if (!exists) return false;
         const inserted = await db
            .insert(issueLabel)
            .values({ issueId, labelId })
            .onConflictDoNothing()
            .returning({ labelId: issueLabel.labelId });
         if (inserted.length === 0) return false;
         await logRun(db, rule, issueId, ctx, `added label ${labelId}`);
         publish({ entity: 'issue', action: 'updated', id: issueId });
         await runAutomations(db, 'issue.label_added', issueId, {
            ...ctx,
            labelId,
            depth: nextDepth,
            chain,
         });
         return true;
      }
      case 'set_status': {
         const statusId = rule.config.statusId!;
         if (target.statusId === statusId) return false;
         const { statuses } = await getCachedCatalogs(db);
         const next = statuses.find((s) => s.id === statusId);
         if (!next) return false;
         const set: Record<string, unknown> = { statusId, updatedAt: now };
         if (next.category === 'started' && !target.startedAt) set.startedAt = now;
         if (next.category === 'completed') {
            set.completedAt = now;
            if (!target.startedAt) set.startedAt = now;
         }
         await db.update(issueT).set(set).where(eq(issueT.id, issueId));
         await logRun(db, rule, issueId, ctx, `set status to ${next.name}`);
         publish({ entity: 'issue', action: 'updated', id: issueId, actorEmail: ctx.actorEmail });
         await runAutomations(db, 'issue.status_changed', issueId, {
            ...ctx,
            toCategory: next.category,
            depth: nextDepth,
            chain,
         });
         return true;
      }
      case 'set_priority': {
         const priorityId = rule.config.priorityId!;
         if (target.priorityId === priorityId) return false;
         const { priorities } = await getCachedCatalogs(db);
         const next = priorities.find((p) => p.id === priorityId);
         if (!next) return false;
         const set: Record<string, unknown> = { priorityId, updatedAt: now };
         // SLA (#97): a automação escreve direto na tabela, então precisa recalcular o
         // prazo como a UI faz — senão a issue fica com a prioridade nova e o prazo da
         // antiga. Só quando o due date é automático (ou não existe), igual ao
         // `updateIssue`. A trigger de `sla_due_at` garante que o prazo não afrouxa.
         if (target.dueDate === null || target.slaAppliedAt !== null) {
            const sla = await applySla(db, target.teamId, priorityId, now);
            if (sla) {
               set.dueDate = sla.dueDate;
               set.slaAppliedAt = sla.slaAppliedAt;
               set.slaDueAt = sla.dueAt;
            }
         }
         await db.update(issueT).set(set).where(eq(issueT.id, issueId));
         await logRun(db, rule, issueId, ctx, `set priority to ${next.name}`);
         publish({ entity: 'issue', action: 'updated', id: issueId, actorEmail: ctx.actorEmail });
         return true;
      }
      case 'set_assignee': {
         const assigneeId = rule.config.assigneeId!;
         if (target.assigneeId === assigneeId) return false;
         const [user] = await db
            .select({ id: appUser.id, name: appUser.name })
            .from(appUser)
            .where(eq(appUser.id, assigneeId))
            .limit(1);
         if (!user) return false;
         await db.update(issueT).set({ assigneeId, updatedAt: now }).where(eq(issueT.id, issueId));
         await db
            .insert(issueAssignee)
            .values({ issueId, userId: assigneeId, createdAt: now })
            .onConflictDoNothing();
         await logRun(db, rule, issueId, ctx, `assigned to ${user.name}`);
         publish({ entity: 'issue', action: 'updated', id: issueId, actorEmail: ctx.actorEmail });
         return true;
      }
      case 'close_sub_issues': {
         const doneId = rule.config.statusId ?? (await defaultCompletedStatusId(db));
         if (!doneId) return false;
         const { statuses } = await getCachedCatalogs(db);
         const categoryOf = new Map(statuses.map((s) => [s.id, s.category]));
         const children = await db
            .select({ id: issueT.id, statusId: issueT.statusId, startedAt: issueT.startedAt })
            .from(issueT)
            .where(eq(issueT.parentId, issueId));
         const open = children.filter((c) => {
            const cat = categoryOf.get(c.statusId);
            return cat !== 'completed' && cat !== 'canceled';
         });
         if (open.length === 0) return false;
         await db
            .update(issueT)
            .set({ statusId: doneId, completedAt: now, updatedAt: now })
            .where(
               inArray(
                  issueT.id,
                  open.map((c) => c.id)
               )
            );
         for (const child of open) {
            if (!child.startedAt)
               await db.update(issueT).set({ startedAt: now }).where(eq(issueT.id, child.id));
            await logRun(db, rule, child.id, ctx, 'closed with the parent issue');
            publish({ entity: 'issue', action: 'updated', id: child.id });
         }
         publish({ entity: 'issue', action: 'updated', id: issueId });
         return true;
      }
      default:
         return false;
   }
}
