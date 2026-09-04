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

/* ------------------------------- Anti-SSRF -------------------------------- */

/**
 * Sufixos de host sempre bloqueados: nomes que só resolvem DENTRO da rede (DNS do
 * cluster, resolvers de VPC, mDNS). Um webhook apontando pra cá transforma o Circle
 * em proxy pra rede interna.
 */
const BLOCKED_HOST_SUFFIXES = [
   'localhost',
   '.localhost',
   '.local',
   '.internal',
   '.svc',
   '.svc.cluster.local',
   '.cluster.local',
];

/**
 * Escape hatch de DESENVOLVIMENTO: libera destino privado (os testes sobem um receptor
 * em `127.0.0.1`). Fail-closed em produção — lá o flag é ignorado, ponto.
 */
function privateTargetsAllowed(): boolean {
   return (
      process.env.NODE_ENV !== 'production' && process.env.CIRCLE_WEBHOOK_ALLOW_PRIVATE === 'true'
   );
}

/** IPv4 em octetos, ou null se não for um literal IPv4. */
function ipv4Octets(host: string): number[] | null {
   const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
   if (!m) return null;
   const parts = m.slice(1).map(Number);
   return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
}

/**
 * `true` para endereços que nunca devem ser alvo de webhook: loopback, link-local
 * (169.254 — o metadata do EC2/IMDS mora aí), RFC1918, CGNAT, `0.0.0.0/8`, multicast
 * e os equivalentes IPv6 (`::1`, `fc00::/7`, `fe80::/10`, IPv4 mapeado).
 */
export function isPrivateAddress(address: string): boolean {
   const host = address.replace(/^\[|\]$/g, '').toLowerCase();
   const v4 = ipv4Octets(host);
   if (v4) {
      const [a, b] = v4;
      return (
         a === 0 ||
         a === 127 ||
         a === 10 ||
         (a === 169 && b === 254) ||
         (a === 172 && b >= 16 && b <= 31) ||
         (a === 192 && b === 168) ||
         (a === 100 && b >= 64 && b <= 127) ||
         a >= 224
      );
   }
   if (!host.includes(':')) return false; // não é IP literal — o gate de DNS resolve
   if (host === '::' || host === '::1') return true;
   // IPv4 mapeado/compatível (`::ffff:169.254.169.254`) reaproveita a régua acima.
   const mapped = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
   if (mapped) return isPrivateAddress(mapped[1]);
   const head = host.split(':')[0];
   if (/^f[cd]/.test(head)) return true; // fc00::/7 (ULA)
   if (/^fe[89ab]/.test(head)) return true; // fe80::/10 (link-local)
   return false;
}

/** `true` se o hostname é um nome que só existe na rede interna. */
export function isBlockedHostname(hostname: string): boolean {
   const h = hostname.trim().toLowerCase().replace(/\.$/, '');
   return BLOCKED_HOST_SUFFIXES.some((s) => (s.startsWith('.') ? h.endsWith(s) : h === s));
}

/**
 * 400 quando a URL do webhook aponta para a rede interna (SSRF). Resolve o DNS ANTES
 * de gravar, então um nome público que aponta para `169.254.169.254` também cai aqui —
 * e a checagem é repetida no disparo, fechando o rebind entre criar e entregar.
 */
export async function assertSafeWebhookTarget(url: string): Promise<void> {
   let parsed: URL;
   try {
      parsed = new URL(url);
   } catch {
      throw new ApiError(400, 'URL inválida');
   }
   if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      throw new ApiError(400, 'A URL precisa ser http(s)');
   if (privateTargetsAllowed()) return;
   const host = parsed.hostname;
   if (isBlockedHostname(host)) throw new ApiError(400, 'Destino não permitido (host interno)');
   if (isPrivateAddress(host)) throw new ApiError(400, 'Destino não permitido (endereço privado)');
   if (ipv4Octets(host) || host.includes(':')) return; // literal público: nada a resolver
   const { lookup } = await import('node:dns/promises');
   let addresses: { address: string }[];
   try {
      addresses = await lookup(host, { all: true });
   } catch {
      throw new ApiError(400, 'Destino não permitido (host não resolve)');
   }
   if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address)))
      throw new ApiError(400, 'Destino não permitido (resolve para endereço privado)');
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
   await assertSafeWebhookTarget(input.url);
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
   if (url !== existing.url) await assertSafeWebhookTarget(url);
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
      // Revalida o destino A CADA disparo: fecha o DNS rebind entre criar o webhook
      // (onde o nome resolvia público) e entregar (onde já aponta pra rede interna).
      await assertSafeWebhookTarget(hook.url);
      const res = await fetchImpl(hook.url, {
         method: 'POST',
         headers: {
            'content-type': 'application/json',
            'X-Circle-Event': delivery.event,
            'X-Circle-Delivery': delivery.id,
            'X-Circle-Signature': signPayload(hook.secret, body),
         },
         body,
         // Sem seguir redirect: um 302 para `169.254.169.254` burlaria a allow-list,
         // que só validou a URL cadastrada.
         redirect: 'manual',
         signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      responseCode = res.status;
      // O CORPO da resposta remota NUNCA é lido nem guardado: `lastError` fica só com
      // o status, senão a tela de entregas viraria um leitor de páginas internas.
      if (res.status >= 300 && res.status < 400)
         error = `HTTP ${res.status} (redirect não seguido)`;
      else if (!res.ok) error = `HTTP ${res.status}`;
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
      const due = await db
         .select()
         .from(webhookDelivery)
         .where(
            and(
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

      const hookIds = [...new Set(due.map((d) => d.webhookId))];
      const hooks = await db.select().from(webhookT).where(inArray(webhookT.id, hookIds));
      const byId = new Map(hooks.map((h) => [h.id, h]));

      let tried = 0;
      for (const d of due) {
         const hook = byId.get(d.webhookId);
         // Webhook desligado depois do enfileiramento: não insiste, mas também não perde
         // o registro — fica pendente até religarem.
         if (!hook || !hook.enabled) continue;
         await attemptDelivery(db, d, hook, fetchImpl);
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
 * Chamado por `publish` (fire-and-forget). Monta o payload, enfileira/dispara e aproveita
 * a passagem para varrer as entregas vencidas — é o "sweep a cada publish" da spec.
 */
export async function onCircleEvent(db: Db, event: CircleEvent): Promise<void> {
   const name = eventNameFor(event);
   if (!name) return;
   await dispatchEvent(db, name, {
      entity: event.entity,
      action: event.action,
      id: event.id ?? null,
      actorEmail: event.actorEmail ?? null,
      occurredAt: new Date().toISOString(),
   });
   await sweepWebhookDeliveries(db);
}
