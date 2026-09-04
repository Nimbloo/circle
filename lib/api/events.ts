/**
 * Event bus in-memory (pub/sub) para a sincronização em tempo real (estilo Linear).
 *
 * Deploy = 1 réplica (autoscaling off) → um barramento em processo é suficiente,
 * sem Redis. Cada subscriber é tipicamente o `enqueue` de um stream SSE
 * (ver `app/api/v1/events/route.ts`). As mutações dos serviços publicam eventos
 * grossos ({entity, action}); o cliente faz um refetch coarse debounced do store
 * afetado (ver `lib/use-live-sync.ts`).
 *
 * O Set de subscribers vive num global (como `db/index.ts`) para sobreviver ao HMR
 * do Next em dev — senão cada recompilação criaria um Set novo e vazaria o antigo.
 */

/** Entidades que sofrem mutação e disparam sincronização no cliente. */
export type CircleEntity =
   | 'issue'
   | 'comment'
   | 'project'
   | 'cycle'
   | 'initiative'
   | 'view'
   | 'label'
   | 'team'
   | 'member'
   | 'notification'
   | 'document'
   /** Comentário/veredito de review; `id` do evento é o do REVIEW (o cliente recarrega o aberto). */
   | 'review_comment';

import { randomUUID } from 'node:crypto';

export type CircleAction = 'created' | 'updated' | 'deleted';

export interface CircleEvent {
   entity: CircleEntity;
   action: CircleAction;
   /** id do recurso afetado, quando disponível (opcional). */
   id?: string;
   /** e-mail do ator que causou a mutação, quando disponível (opcional). */
   actorEmail?: string;
   /**
    * Selo monotônico só para ordenação/deduplicação no cliente. É um contador
    * incremental (NÃO `Date.now()`): o valor absoluto é irrelevante e evita
    * depender de `Date.now()` — proibido em alguns ambientes de build/AOT.
    */
   ts: number;
}

export type Subscriber = (event: CircleEvent) => void;

/**
 * Fan-out entre pods via Postgres LISTEN/NOTIFY (sem Redis/SaaS — usa o Postgres
 * que já temos). `publish` entrega LOCALMENTE (síncrono, latência zero pros clientes
 * SSE do próprio pod) E dispara `pg_notify`; cada pod mantém uma conexão dedicada
 * `LISTEN circle_events` que recebe as notificações dos OUTROS pods e faz o fan-out
 * local. Assim, subir replicas>1 não quebra o realtime (evita débito de escala).
 *
 * Dedup: cada notificação carrega o id da instância que publicou; a conexão LISTEN
 * ignora as próprias (já entregues localmente) → sem entrega dupla no mesmo pod.
 *
 * Em teste (NODE_ENV=test, PGlite) o LISTEN/NOTIFY é desligado → barramento puramente
 * in-memory, determinístico (os testes de `publish`→`subscribe` seguem síncronos).
 */
const CHANNEL = 'circle_events';

const g = globalThis as unknown as {
   __circleEventSubs?: Set<Subscriber>;
   __circleEventSeq?: number;
   __circleListenStarted?: boolean;
   __circleInstanceId?: string;
};

/**
 * Id ÚNICO por processo (não `process.pid` — em container node é pid 1 em TODO
 * pod, o que faria a dedup descartar os eventos de outros pods). Lazy + guardado
 * no global (sobrevive ao HMR); só é computado em runtime real (nunca no build).
 */
function instanceId(): string {
   // Computado sob demanda (runtime), nunca no top-level do módulo → não roda no build.
   if (!g.__circleInstanceId) g.__circleInstanceId = randomUUID();
   return g.__circleInstanceId;
}

function subs(): Set<Subscriber> {
   if (!g.__circleEventSubs) g.__circleEventSubs = new Set<Subscriber>();
   return g.__circleEventSubs;
}

/** Selo `ts` monotônico via contador module-level (sobrevive ao HMR no global). */
function nextTs(): number {
   g.__circleEventSeq = (g.__circleEventSeq ?? 0) + 1;
   return g.__circleEventSeq;
}

/** Entrega local (síncrona) a todos os subscribers do processo. Nunca lança. */
function fanOutLocal(event: CircleEvent): void {
   for (const fn of subs()) {
      try {
         fn(event);
      } catch {
         // subscriber quebrado é problema dele — o barramento segue.
      }
   }
}

/** LISTEN/NOTIFY só em runtime real (não em teste/PGlite). */
function notifyEnabled(): boolean {
   return process.env.NODE_ENV !== 'test' && !!process.env.DATABASE_URL;
}

/**
 * Conexão dedicada `LISTEN circle_events` (uma por pod). Recebe as notificações
 * dos OUTROS pods e faz fan-out local. Reconecta em erro/fim (best-effort). Lazy:
 * inicia no 1º `subscribe` em runtime real. `pg`/`Client` são importados de forma
 * preguiçosa pra não pesar no bundle e não rodar em teste.
 */
async function startListener(): Promise<void> {
   if (g.__circleListenStarted || !notifyEnabled()) return;
   g.__circleListenStarted = true;
   const { Client } = await import('pg');
   const connect = async (): Promise<void> => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      // Ponto ÚNICO de reconexão (guardado): error/end/falha no connect convergem
      // aqui e agendam UMA reconexão, fechando o client morto — sem loops duplos
      // nem acúmulo de conexões dedicadas.
      let reconnectScheduled = false;
      const scheduleReconnect = (): void => {
         if (reconnectScheduled) return;
         reconnectScheduled = true;
         client.removeAllListeners();
         client.end().catch(() => {});
         setTimeout(() => {
            void connect();
         }, 2000);
      };
      client.on('error', scheduleReconnect);
      client.on('end', scheduleReconnect);
      client.on('notification', (msg) => {
         if (!msg.payload) return;
         try {
            const ev = JSON.parse(msg.payload) as CircleEvent & { __inst?: string };
            if (ev.__inst === instanceId()) return; // já entregue localmente
            fanOutLocal(ev);
         } catch {
            /* payload malformado — ignora */
         }
      });
      try {
         await client.connect();
         await client.query(`LISTEN ${CHANNEL}`);
      } catch {
         scheduleReconnect();
      }
   };
   void connect();
}

/** Registra um subscriber. Retorna a função de unsubscribe (idempotente). */
export function subscribe(fn: Subscriber): () => void {
   subs().add(fn);
   void startListener();
   return () => {
      subs().delete(fn);
   };
}

/**
 * Publica um evento. Entrega local síncrona (clientes do próprio pod) + `pg_notify`
 * best-effort (outros pods). Carimba o `ts` internamente e NUNCA lança — um
 * subscriber ou o DB indisponível não podem derrubar a mutação que originou o evento.
 */
export function publish(event: Omit<CircleEvent, 'ts'>): void {
   const full: CircleEvent = { ...event, ts: nextTs() };
   fanOutLocal(full);
   if (notifyEnabled()) {
      // fire-and-forget: usa o pool do drizzle (import preguiçoso), best-effort.
      void (async () => {
         try {
            const { db } = await import('@/db');
            const { sql } = await import('drizzle-orm');
            const payload = JSON.stringify({ ...full, __inst: instanceId() });
            await db.execute(sql`select pg_notify(${CHANNEL}, ${payload})`);
         } catch {
            // DB indisponível → só o fan-out cross-pod se perde; o local já ocorreu.
         }
      })();
   }
   dispatchWebhooks(full);
}

/**
 * Webhooks de saída (#101): o barramento é o ponto único por onde toda mutação passa,
 * então é daqui que as entregas são enfileiradas. Fire-and-forget com import preguiçoso
 * (mantém `lib/api/webhooks.ts` e o `db` fora do grafo estático do Edge) e o mesmo gate
 * do LISTEN/NOTIFY: em teste o barramento segue puramente in-memory e determinístico —
 * os testes de webhook chamam `dispatchEvent`/`sweepWebhookDeliveries` diretamente.
 */
function dispatchWebhooks(event: CircleEvent): void {
   if (!notifyEnabled()) return;
   void (async () => {
      try {
         const { db } = await import('@/db');
         const { onCircleEvent } = await import('./webhooks');
         await onCircleEvent(db, event);
      } catch {
         // Webhook é best-effort: nunca derruba a mutação que originou o evento.
      }
   })();
}

/** Nº de subscribers ativos (diagnóstico/teste). */
export function subscriberCount(): number {
   return subs().size;
}
