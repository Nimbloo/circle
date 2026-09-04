/**
 * Webhooks de saída (#101).
 *
 * O barramento de eventos (`lib/api/events.ts`) é o ponto ÚNICO por onde toda mutação
 * passa, então é dele que os webhooks são alimentados: cada `publish` vira uma linha em
 * `webhook_delivery` por webhook assinante, disparada INLINE (best-effort, timeout 5 s).
 *
 * Falhou? A linha guarda `next_attempt_at` com backoff (1 m, 5 m, 30 m, 2 h, 24 h) e um
 * SWEEP lazy reprocessa — no boot e a cada publish, nunca por CronJob.
 * O sweep pega um advisory lock para que múltiplos pods não entreguem em duplicidade.
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser, webhook as webhookT, webhookDelivery } from '@/db/schema';
import { ApiError } from './errors';
import type { CircleEvent } from './events';
// O catálogo de eventos vive num módulo client-safe (a tela de Settings o lê em runtime).
import { WEBHOOK_EVENTS, type WebhookEvent } from './webhook-events';

export { WEBHOOK_EVENTS };
export type { WebhookEvent };

export type DeliveryStatus = 'pending' | 'success' | 'failed' | 'exhausted';

/**
 * Espera antes de cada retry, em minutos. Uma entrega = 1 tentativa inline + até 5
 * retries agendados por esta curva; depois do último, `exhausted` (não insiste mais).
 */
const BACKOFF_MINUTES = [1, 5, 30, 120, 1440];
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;
const TIMEOUT_MS = 5000;
/** Chave do advisory lock do sweep (constante estável; qualquer int64 serve). */
const SWEEP_LOCK_KEY = 4210772;

export interface WebhookDto {
   id: string;
   url: string;
   events: WebhookEvent[];
   enabled: boolean;
   createdAt: string;
   createdByName: string | null;
   /** Segredo mostrado só na criação; nas listagens vem `null`. */
   secret?: string;
}

export interface WebhookDeliveryDto {
   id: string;
   webhookId: string;
   event: string;
   status: DeliveryStatus;
   attempts: number;
   responseCode: number | null;
   lastError: string | null;
   nextAttemptAt: string | null;
   createdAt: string;
   updatedAt: string;
}

type WebhookRow = typeof webhookT.$inferSelect;
type DeliveryRow = typeof webhookDelivery.$inferSelect;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function toDto(r: WebhookRow, createdByName: string | null): WebhookDto {
   return {
      id: r.id,
      url: r.url,
      events: (r.events ?? []) as WebhookEvent[],
      enabled: r.enabled,
      createdAt: r.createdAt.toISOString(),
      createdByName,
   };
}

function deliveryDto(r: DeliveryRow): WebhookDeliveryDto {
   return {
      id: r.id,
      webhookId: r.webhookId,
      event: r.event,
      status: r.status as DeliveryStatus,
      attempts: r.attempts,
      responseCode: r.responseCode,
      lastError: r.lastError,
      nextAttemptAt: iso(r.nextAttemptAt),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
   };
}

/* ------------------------------- Assinatura ------------------------------- */

/** `sha256=<hmac hex>` do corpo exato que vai no POST — o receptor recalcula igual. */
export function signPayload(secret: string, body: string): string {
   return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

/** Confere a assinatura em tempo constante (útil para o receptor e para os testes). */
export function verifySignature(secret: string, body: string, signature: string): boolean {
   const expected = Buffer.from(signPayload(secret, body), 'utf8');
   const got = Buffer.from(signature, 'utf8');
   return expected.length === got.length && timingSafeEqual(expected, got);
}

/* ---------------------------------- CRUD ---------------------------------- */

export async function listWebhooks(db: Db): Promise<WebhookDto[]> {
   const rows = await db
      .select({ hook: webhookT, creatorName: appUser.name })
      .from(webhookT)
      .leftJoin(appUser, eq(webhookT.createdBy, appUser.id))
      .orderBy(desc(webhookT.createdAt));
   return rows.map((r) => toDto(r.hook, r.creatorName));
}

export interface CreateWebhookInput {
   url: string;
   events: WebhookEvent[];
   /** Opcional: sem segredo informado, geramos um (mostrado uma vez na resposta). */
   secret?: string;
}

function assertValid(url: string, events: string[]): void {
   let parsed: URL;
   try {
      parsed = new URL(url);
   } catch {
      throw new ApiError(400, 'URL inválida');
   }
   if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      throw new ApiError(400, 'A URL precisa ser http(s)');
   if (events.length === 0) throw new ApiError(400, 'Escolha ao menos um evento');
   const unknown = events.filter((e) => !WEBHOOK_EVENTS.includes(e as WebhookEvent));
   if (unknown.length) throw new ApiError(400, `Evento desconhecido: ${unknown.join(', ')}`);
}

export async function createWebhook(
   db: Db,
   input: CreateWebhookInput,
   actorId: string | null
): Promise<WebhookDto> {
   assertValid(input.url, input.events);
   const id = randomUUID();
   const secret = input.secret?.trim() || randomBytes(24).toString('hex');
   await db.insert(webhookT).values({
      id,
      url: input.url.trim(),
      secret,
      events: [...new Set(input.events)],
      enabled: true,
      createdBy: actorId,
      createdAt: new Date(),
   });
   const [row] = await db.select().from(webhookT).where(eq(webhookT.id, id)).limit(1);
   return { ...toDto(row, null), secret };
}

export interface UpdateWebhookInput {
   url?: string;
   events?: WebhookEvent[];
   enabled?: boolean;
}

export async function updateWebhook(
   db: Db,
   id: string,
   patch: UpdateWebhookInput
): Promise<WebhookDto | null> {
   const [existing] = await db.select().from(webhookT).where(eq(webhookT.id, id)).limit(1);
   if (!existing) return null;
   const url = patch.url ?? existing.url;
   const events = patch.events ?? ((existing.events ?? []) as WebhookEvent[]);
   assertValid(url, events);
   await db
      .update(webhookT)
      .set({
         url: url.trim(),
         events: [...new Set(events)],
         enabled: patch.enabled ?? existing.enabled,
      })
      .where(eq(webhookT.id, id));
   const [row] = await db.select().from(webhookT).where(eq(webhookT.id, id)).limit(1);
   return toDto(row, null);
}

export async function deleteWebhook(db: Db, id: string): Promise<boolean> {
   const [existing] = await db.select().from(webhookT).where(eq(webhookT.id, id)).limit(1);
   if (!existing) return false;
   // As entregas referenciam o webhook (FK): somem junto.
   await db.delete(webhookDelivery).where(eq(webhookDelivery.webhookId, id));
   await db.delete(webhookT).where(eq(webhookT.id, id));
   return true;
}

export async function listDeliveries(
   db: Db,
   webhookId: string,
   limit = 20
): Promise<WebhookDeliveryDto[]> {
   const rows = await db
      .select()
      .from(webhookDelivery)
      .where(eq(webhookDelivery.webhookId, webhookId))
      .orderBy(desc(webhookDelivery.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));
   return rows.map(deliveryDto);
}

/* -------------------------------- Entrega --------------------------------- */

/** Momento da próxima tentativa dado o nº de tentativas já feitas, ou null se esgotou. */
function nextAttempt(attempts: number, from = new Date()): Date | null {
   if (attempts >= MAX_ATTEMPTS) return null;
   const minutes = BACKOFF_MINUTES[attempts - 1];
   if (minutes === undefined) return null;
   return new Date(from.getTime() + minutes * 60_000);
}

/**
 * POSTa a entrega e grava o resultado. Nunca lança: uma falha de rede não pode escapar
 * para a mutação que originou o evento. Retorna true se o receptor respondeu 2xx.
 */
export async function attemptDelivery(
   db: Db,
   delivery: DeliveryRow,
   hook: WebhookRow,
   fetchImpl: typeof fetch = fetch
): Promise<boolean> {
   const body = JSON.stringify(delivery.payload);
   const attempts = delivery.attempts + 1;
   const now = new Date();
   let responseCode: number | null = null;
   let error: string | null = null;

   try {
      const res = await fetchImpl(hook.url, {
         method: 'POST',
         headers: {
            'content-type': 'application/json',
            'X-Circle-Event': delivery.event,
            'X-Circle-Delivery': delivery.id,
            'X-Circle-Signature': signPayload(hook.secret, body),
         },
         body,
         signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      responseCode = res.status;
      if (!res.ok) error = `HTTP ${res.status}`;
   } catch (e) {
      error = (e as Error).message.slice(0, 500);
   }

   const succeeded = error === null;
   const scheduled = succeeded ? null : nextAttempt(attempts, now);
   await db
      .update(webhookDelivery)
      .set({
         attempts,
         status: succeeded ? 'success' : scheduled ? 'failed' : 'exhausted',
         responseCode,
         lastError: error,
         nextAttemptAt: scheduled,
         updatedAt: now,
      })
      .where(eq(webhookDelivery.id, delivery.id));
   return succeeded;
}

/**
 * Enfileira uma entrega por webhook assinante e tenta entregar inline. Devolve os ids
 * das entregas criadas (vazio quando ninguém assina o evento).
 */
export async function dispatchEvent(
   db: Db,
   event: WebhookEvent,
   payload: Record<string, unknown>,
   fetchImpl: typeof fetch = fetch
): Promise<string[]> {
   const hooks = await db
      .select()
      .from(webhookT)
      .where(and(eq(webhookT.enabled, true), sql`${event} = ANY(${webhookT.events})`)!);
   if (hooks.length === 0) return [];

   const now = new Date();
   const rows = hooks.map((hook) => ({
      id: randomUUID(),
      webhookId: hook.id,
      event,
      payload: { ...payload, event, deliveryId: '' },
      status: 'pending' as const,
      attempts: 0,
      nextAttemptAt: null,
      responseCode: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
   }));
   // O id da entrega vai no corpo E no header — o receptor deduplica por ele.
   for (const r of rows) (r.payload as { deliveryId: string }).deliveryId = r.id;
   await db.insert(webhookDelivery).values(rows);

   const byHook = new Map(hooks.map((h) => [h.id, h]));
   await Promise.all(
      rows.map((r) =>
         attemptDelivery(db, r as unknown as DeliveryRow, byHook.get(r.webhookId)!, fetchImpl)
      )
   );
   return rows.map((r) => r.id);
}

/** Reenvia uma entrega já registrada (botão "Redeliver"). 404 se não existir. */
export async function redeliver(
   db: Db,
   deliveryId: string,
   fetchImpl: typeof fetch = fetch
): Promise<WebhookDeliveryDto> {
   const [row] = await db
      .select()
      .from(webhookDelivery)
      .where(eq(webhookDelivery.id, deliveryId))
      .limit(1);
   if (!row) throw new ApiError(404, 'Entrega não encontrada');
   const [hook] = await db.select().from(webhookT).where(eq(webhookT.id, row.webhookId)).limit(1);
   if (!hook) throw new ApiError(404, 'Webhook não encontrado');
   // Reenvio manual zera o contador: é uma decisão do humano, não um retry automático.
   await attemptDelivery(db, { ...row, attempts: 0 }, hook, fetchImpl);
   const [after] = await db
      .select()
      .from(webhookDelivery)
      .where(eq(webhookDelivery.id, deliveryId))
      .limit(1);
   return deliveryDto(after);
}

/* ---------------------------------- Sweep --------------------------------- */

/**
 * Tenta o advisory lock do sweep. Devolve `null` quando outro pod já está varrendo (ou
 * quando o banco não suporta o lock — PGlite nos testes), caso em que seguimos sem ele:
 * o pior cenário é uma entrega repetida, que o receptor deduplica pelo `X-Circle-Delivery`.
 */
async function tryLock(db: Db): Promise<boolean | null> {
   try {
      const res = await db.execute(sql`select pg_try_advisory_lock(${SWEEP_LOCK_KEY}) as locked`);
      const rows = (res as unknown as { rows?: { locked: boolean }[] }).rows ?? [];
      return rows[0]?.locked ?? null;
   } catch {
      return null;
   }
}

async function unlock(db: Db): Promise<void> {
   try {
      await db.execute(sql`select pg_advisory_unlock(${SWEEP_LOCK_KEY})`);
   } catch {
      /* sem lock, nada a liberar */
   }
}

/**
 * Reprocessa as entregas vencidas (lazy: chamado no boot e a cada publish). Devolve
 * quantas foram tentadas. Nunca lança.
 */
export async function sweepWebhookDeliveries(
   db: Db,
   fetchImpl: typeof fetch = fetch,
   limit = 50
): Promise<number> {
   const locked = await tryLock(db);
   if (locked === false) return 0; // outro pod está varrendo
   try {
      // O lote SÓ pega entrega de webhook LIGADO. Sem este filtro, entregas presas de um
      // webhook desabilitado entopem o lote de 50 (ordenado por createdAt asc) e o
      // `continue` abaixo as pula sem consumi-las — o retry de TODOS os outros webhooks
      // morre para sempre. Medido na auditoria com 60 entregas falhadas.
      const due = await db
         .select()
         .from(webhookDelivery)
         .innerJoin(webhookT, eq(webhookT.id, webhookDelivery.webhookId))
         .where(
            and(
               eq(webhookT.enabled, true),
               inArray(webhookDelivery.status, ['pending', 'failed']),
               or(
                  isNull(webhookDelivery.nextAttemptAt),
                  lte(webhookDelivery.nextAttemptAt, new Date())
               )
            )!
         )
         .orderBy(asc(webhookDelivery.createdAt))
         .limit(limit);
      if (due.length === 0) return 0;

      let tried = 0;
      // O join já garante `enabled`; a entrega de webhook desligado continua no banco,
      // pendente, e volta ao lote assim que religarem.
      for (const row of due) {
         await attemptDelivery(db, row.webhook_delivery, row.webhook, fetchImpl);
         tried++;
      }
      return tried;
   } catch (e) {
      console.warn('[circle] sweep de webhooks falhou:', (e as Error).message);
      return 0;
   } finally {
      if (locked === true) await unlock(db);
   }
}

/* -------------------------- Ponte com o barramento ------------------------- */

/** `{entity, action}` do barramento → nome do evento assinável, ou null. */
export function eventNameFor(e: Pick<CircleEvent, 'entity' | 'action'>): WebhookEvent | null {
   const name = `${e.entity}.${e.action}`;
   return WEBHOOK_EVENTS.includes(name as WebhookEvent) ? (name as WebhookEvent) : null;
}

/**
 * Chamado por `publish` (fire-and-forget). Monta o payload, enfileira/dispara e — SÓ
 * quando o evento realmente criou entrega — aproveita a passagem para varrer as
 * vencidas. Varrer a cada `publish` custava ~5 queries por mutação em workspace sem
 * webhook nenhum; sem assinante não há fila para varrer.
 */
export async function onCircleEvent(db: Db, event: CircleEvent): Promise<void> {
   const name = eventNameFor(event);
   if (!name) return;
   const delivered = await dispatchEvent(db, name, {
      entity: event.entity,
      action: event.action,
      id: event.id ?? null,
      actorEmail: event.actorEmail ?? null,
      occurredAt: new Date().toISOString(),
   });
   if (delivered.length === 0) return;
   await sweepWebhookDeliveries(db);
}
