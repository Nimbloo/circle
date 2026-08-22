import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq, asc } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   status as statusT,
   priority as priorityT,
   label as labelT,
   team as teamT,
   issue as issueT,
} from '@/db/schema';
import { createIssue, getIssueByIdentifier } from '../issues';
import { ApiError } from '../errors';

/**
 * Integração Sentry → Circle (Integration Platform, UI component `issue-link`).
 * O Sentry chama os endpoints `create`/`link` com POST `{fields, issueId, webUrl, project, actor}`
 * assinado em `Sentry-App-Signature` (UI components) — HMAC-SHA256 do body cru com o Client
 * Secret da integração (webhooks de evento usam `Sentry-Hook-Signature`; ver signatureFrom).
 * Devolvemos `{webUrl, project, identifier}` — o Sentry mostra `project#identifier`
 * linkando pro card. Toda config é via env; sem `CIRCLE_SENTRY_CLIENT_SECRET` a integração
 * fica DESLIGADA (verify falha → 401), never lança em runtime por config ausente.
 */

const LABEL_ID = 'sentry';

function appUrl(): string {
   return (process.env.CIRCLE_APP_URL || 'https://circle.nimbloo.ai').replace(/\/$/, '');
}
function workspaceSlug(): string {
   return process.env.CIRCLE_WORKSPACE_SLUG || 'nimbloo';
}
/** Autor dos cards criados via Sentry (provisionado no 1º uso). */
function actorEmail(): string {
   const explicit = process.env.CIRCLE_SENTRY_ACTOR_EMAIL?.trim();
   if (explicit) return explicit;
   const firstAdmin = process.env.CIRCLE_ADMIN_EMAILS?.split(',')[0]?.trim();
   return firstAdmin || 'sentry@nimbloo.ai';
}

/** URL pública do card no Circle (rota por identifier: /{org}/issue/CORE-1). */
export function cardUrl(identifier: string): string {
   return `${appUrl()}/${workspaceSlug()}/issue/${identifier}`;
}

/**
 * Extrai a assinatura do Sentry dos headers. São DOIS headers, ambos HMAC-SHA256 do body
 * cru com o Client Secret — só muda o nome conforme a origem da request:
 *   - `Sentry-App-Signature`  → requests de UI component (issue-link `create`/`link`, select)
 *   - `Sentry-Hook-Signature` → webhooks de evento (installation.*, issue.* etc.)
 * (Confirmado no código do Sentry: sentry_apps/external_requests usa Sentry-App-Signature.)
 */
export function signatureFrom(headers: Headers): string | null {
   return headers.get('sentry-app-signature') ?? headers.get('sentry-hook-signature');
}

/**
 * Verifica a assinatura do Sentry (HMAC-SHA256 do body CRU com o Client Secret).
 * Retorna false se o secret não está configurado (integração off) ou a assinatura diverge.
 */
export function verifySignature(rawBody: string, signature: string | null | undefined): boolean {
   const secret = process.env.CIRCLE_SENTRY_CLIENT_SECRET;
   if (!secret || !signature) return false;
   const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
   const a = Buffer.from(expected, 'utf8');
   const b = Buffer.from(signature, 'utf8');
   if (a.length !== b.length) return false;
   return timingSafeEqual(a, b);
}

/** Garante o label 'sentry' (idempotente). Retorna o id. */
async function ensureSentryLabel(db: Db): Promise<string> {
   const existing = await db
      .select({ id: labelT.id })
      .from(labelT)
      .where(eq(labelT.id, LABEL_ID))
      .limit(1);
   if (existing.length === 0) {
      await db
         .insert(labelT)
         .values({ id: LABEL_ID, name: 'Sentry', color: 'red' })
         .onConflictDoNothing();
   }
   return LABEL_ID;
}

/** Resolve um id de catálogo: usa o preferido se existir, senão o primeiro (por position). */
async function resolveStatusId(db: Db, preferred: string): Promise<string> {
   const hit = await db
      .select({ id: statusT.id })
      .from(statusT)
      .where(eq(statusT.id, preferred))
      .limit(1);
   if (hit.length > 0) return hit[0].id;
   const first = await db
      .select({ id: statusT.id })
      .from(statusT)
      .orderBy(asc(statusT.position))
      .limit(1);
   if (first.length === 0) throw new ApiError(500, 'Nenhum status no catálogo');
   return first[0].id;
}
async function resolvePriorityId(db: Db, preferred: string): Promise<string> {
   const hit = await db
      .select({ id: priorityT.id })
      .from(priorityT)
      .where(eq(priorityT.id, preferred))
      .limit(1);
   if (hit.length > 0) return hit[0].id;
   const first = await db
      .select({ id: priorityT.id })
      .from(priorityT)
      .orderBy(asc(priorityT.position))
      .limit(1);
   if (first.length === 0) throw new ApiError(500, 'Nenhuma priority no catálogo');
   return first[0].id;
}

/** Resolve o time: o pedido (se existir) → CIRCLE_SENTRY_DEFAULT_TEAM → 1º time. */
async function resolveTeam(
   db: Db,
   requested?: string | null
): Promise<{ id: string; name: string }> {
   const tryIds = [requested, process.env.CIRCLE_SENTRY_DEFAULT_TEAM].filter(Boolean) as string[];
   for (const id of tryIds) {
      const rows = await db
         .select({ id: teamT.id, name: teamT.name })
         .from(teamT)
         .where(eq(teamT.id, id))
         .limit(1);
      if (rows.length > 0) return rows[0];
   }
   const first = await db
      .select({ id: teamT.id, name: teamT.name })
      .from(teamT)
      .orderBy(asc(teamT.id))
      .limit(1);
   if (first.length === 0) throw new ApiError(400, 'Nenhum time disponível para criar o card');
   return first[0];
}

export interface SentryCardInput {
   title: string;
   description?: string | null;
   teamId?: string | null;
   /** URL da issue no Sentry (rodapé do card, pra voltar ao erro). */
   sentryWebUrl?: string | null;
   /** Id da issue no Sentry — dedup: reenvio/replay do mesmo erro reusa o card.
    *  O Sentry manda como NÚMERO (id numérico da issue); coagimos pra string. */
   sentryIssueId?: string | number | null;
}

/** Monta o resultado a partir de um card existente (por identifier + teamId). */
async function resultFor(db: Db, identifier: string, teamId: string): Promise<SentryLinkResult> {
   const t = await db.select({ name: teamT.name }).from(teamT).where(eq(teamT.id, teamId)).limit(1);
   return { webUrl: cardUrl(identifier), project: t[0]?.name ?? teamId, identifier };
}

/** Busca um card já criado pra essa issue do Sentry (dedup). */
async function findBySentryId(db: Db, sentryIssueId: string): Promise<SentryLinkResult | null> {
   const rows = await db
      .select({ identifier: issueT.identifier, teamId: issueT.teamId })
      .from(issueT)
      .where(eq(issueT.sentryIssueId, sentryIssueId))
      .limit(1);
   return rows.length ? resultFor(db, rows[0].identifier, rows[0].teamId) : null;
}
export interface SentryLinkResult {
   webUrl: string;
   project: string;
   identifier: string;
}

/** Cria um card no Circle a partir de um erro do Sentry. Retorna o shape que o Sentry espera. */
export async function createCardFromSentry(
   db: Db,
   input: SentryCardInput
): Promise<SentryLinkResult> {
   const title = input.title?.trim();
   if (!title) throw new ApiError(400, 'title é obrigatório');

   // Dedup: replay/retry do Sentry pro mesmo erro reusa o card existente (não duplica).
   // O Sentry manda issueId como número → coage pra string antes de usar/persistir.
   const sentryIdStr = input.sentryIssueId != null ? String(input.sentryIssueId).trim() : '';
   const sentryId = sentryIdStr !== '' ? sentryIdStr : null;
   if (sentryId) {
      const existing = await findBySentryId(db, sentryId);
      if (existing) return existing;
   }

   const team = await resolveTeam(db, input.teamId);
   const [statusId, priorityId, labelId] = await Promise.all([
      resolveStatusId(db, process.env.CIRCLE_SENTRY_STATUS_ID || 'triage'),
      resolvePriorityId(db, process.env.CIRCLE_SENTRY_PRIORITY_ID || 'high'),
      ensureSentryLabel(db),
   ]);

   const base = input.description?.trim() ? `${input.description.trim()}\n\n` : '';
   const footer = input.sentryWebUrl ? `---\nOrigem (Sentry): ${input.sentryWebUrl}` : '';
   const description = (base + footer).trim() || null;

   try {
      const created = await createIssue(
         db,
         {
            teamId: team.id,
            title,
            statusId,
            priorityId,
            labelIds: [labelId],
            description,
            sentryIssueId: sentryId,
         },
         actorEmail()
      );
      return {
         webUrl: cardUrl(created.identifier),
         project: team.name,
         identifier: created.identifier,
      };
   } catch (e) {
      // Corrida: outro replay criou o card com o mesmo sentryIssueId (23505 na unique).
      if (sentryId && (e as { code?: string })?.code === '23505') {
         const existing = await findBySentryId(db, sentryId);
         if (existing) return existing;
      }
      throw e;
   }
}

/** Linka um card EXISTENTE (por identifier, ex.: CORE-12) a uma issue do Sentry. */
export async function linkCardFromSentry(
   db: Db,
   identifier: string
): Promise<SentryLinkResult | null> {
   const id = identifier?.trim();
   if (!id) return null;
   const issue = await getIssueByIdentifier(db, id);
   if (!issue) return null;
   const t = await db
      .select({ name: teamT.name })
      .from(teamT)
      .where(eq(teamT.id, issue.teamId))
      .limit(1);
   const project = t[0]?.name ?? issue.teamId;
   return { webUrl: cardUrl(issue.identifier), project, identifier: issue.identifier };
}

/** Opções de time pro select do formulário de criação (Sentry consome como [{label,value}]). */
export async function teamOptions(db: Db): Promise<{ label: string; value: string }[]> {
   const rows = await db
      .select({ id: teamT.id, name: teamT.name })
      .from(teamT)
      .orderBy(asc(teamT.id));
   return rows.map((t) => ({ label: `${t.name} (${t.id})`, value: t.id }));
}
