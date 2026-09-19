/**
 * Event bus (pub/sub) da sincronização em tempo real (estilo Linear).
 *
 * Cada subscriber é tipicamente o `enqueue` de um stream SSE (ver
 * `app/api/v1/events/route.ts`). As mutações publicam eventos {entity, action, id}.
 *
 * Entrega em dois níveis: fan-out LOCAL síncrono (latência zero para os clientes do
 * próprio pod) e `pg_notify` para os demais pods — detalhado na nota do `CHANNEL`,
 * abaixo. Não depende de Redis nem de serviço externo: usa o Postgres que já existe.
 *
 * O que o cliente faz com o evento NÃO é uniforme (`lib/use-live-sync.ts`): os
 * caminhos quentes — issue, project, initiative — são TARGETED (re-busca só aquela
 * entidade e faz splice). O refetch coarse debounced ficou para o que muda raramente
 * e não tem id útil: catalog, team, member, view, document, cycle, notification.
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
   | 'review_comment'
   /**
    * Dado de REFERÊNCIA do workspace que não tem store próprio: status (as colunas do
    * board!), templates, SLA, emoji. Tudo isso chega pelo bootstrap, então o cliente
    * responde re-hidratando o workspace. Sem este evento, mudar o workflow de um time só
    * aparecia para os outros depois de um reload — e o board seguia com colunas velhas.
    */
   | 'catalog'
   /**
    * O REVIEW em si (não o comentário): sync do GitHub e webhook de PR/check mudam a
    * lista, que antes só carregava no mount. `id` é o do review; sem id, "algo mudou".
    */
   | 'review'
   /** Regra de automação de um time (CRUD); `teamId` diz de qual time é a tela a recarregar. */
   | 'automation'
   /**
    * Job de import em background (#10): endereçado ao DONO (`recipientId`), `id` = job.
    * A tela de import consulta `GET /import/jobs/:id` ao receber.
    */
   | 'import'
   /**
    * Sinal LOCAL do pod (não vem de mutação): a conexão LISTEN caiu e voltou, então
    * eventos de outros pods podem ter se perdido no intervalo. O cliente deve tratar
    * como uma reconexão — re-hidratar issues, workspace e notificações.
    */
   | 'resync';

import { randomUUID } from 'node:crypto';

export type CircleAction = 'created' | 'updated' | 'deleted';

/** O que mudou num evento `catalog` fora do bootstrap (#53). */
export type CatalogKind = 'template' | 'project_template' | 'sla' | 'emoji';

export interface CircleEvent {
   entity: CircleEntity;
   action: CircleAction;
   /** id do recurso afetado, quando disponível (opcional). */
   id?: string;
   /** e-mail do ator que causou a mutação, quando disponível (opcional). */
   actorEmail?: string;
   /**
    * Time dono do recurso, quando houver (opcional). É o que permite ao stream entregar
    * COM id ao convidado o que é do escopo dele e descartar o resto, sem query por evento.
    */
   teamId?: string;
   /**
    * Issue a que o recurso pertence (opcional) — em `comment` o `id` é o do comentário,
    * então o cliente usa este campo para recarregar só o detalhe certo.
    */
   issueId?: string;
   /** Destinatário único do evento (opcional). Presente → só esse usuário o recebe. */
   recipientId?: string;
   /**
    * Subtipo do `catalog` (#53). Ausente = dado que vive no bootstrap (status): o cliente
    * re-hidrata o workspace. Com kind, só quem exibe aquele dado recarrega.
    */
   kind?: CatalogKind;
   /**
    * Selo monotônico só para ordenação/deduplicação no cliente. É um contador
    * incremental (NÃO `Date.now()`): o valor absoluto é irrelevante e evita
    * depender de `Date.now()` — proibido em alguns ambientes de build/AOT.
    */
   ts: number;
}

export type Subscriber = (event: CircleEvent) => void;

/** Quem está do outro lado do stream: resolvido UMA vez na abertura. */
export interface EventViewer {
   userId: string;
   /** Times visíveis; `null` = sem restrição (Member/Admin). */
   teamIds: string[] | null;
}

/**
 * O que um viewer recebe de um evento: o evento inteiro, a versão redigida (só
 * `entity`/`action`/`ts`) ou nada (`null`). Decide só com o que já está em memória.
 *
 * - `recipientId` presente: só o destinatário recebe (para qualquer papel).
 * - Sem restrição de escopo: evento completo.
 * - Escopo restrito com `teamId`: completo se o time está no escopo; senão, nada.
 * - Escopo restrito sem `teamId`: redigido — o suficiente para refazer as listas que
 *   ele vê, sem revelar ids nem autoria de atividade alheia.
 */
export function eventForViewer(event: CircleEvent, viewer: EventViewer): CircleEvent | null {
   if (event.entity === 'resync') return event;
   if (event.recipientId) return event.recipientId === viewer.userId ? event : null;
   if (viewer.teamIds === null) return event;
   if (event.teamId) return viewer.teamIds.includes(event.teamId) ? event : null;
   // `kind` não revela nada do recurso e evita que o convidado refaça o bootstrap à toa.
   return event.kind
      ? { entity: event.entity, action: event.action, kind: event.kind, ts: event.ts }
      : { entity: event.entity, action: event.action, ts: event.ts };
}

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

/** O mínimo do `pg.Client` que o listener usa (permite testar com um cliente falso). */
export interface ListenClient {
   on(event: 'error' | 'end', fn: (err?: unknown) => void): unknown;
   on(event: 'notification', fn: (msg: { payload?: string }) => void): unknown;
   connect(): Promise<unknown>;
   query(sql: string): Promise<unknown>;
   end(): Promise<unknown>;
   removeAllListeners(): unknown;
}

export interface ListenerOptions {
   makeClient: () => ListenClient;
   /** Evento recebido de OUTRO pod (já sem o próprio). */
   onEvent: (event: CircleEvent) => void;
   /** A conexão caiu e voltou: NOTIFYs do intervalo podem ter se perdido. */
   onResync: () => void;
   /** Intervalo do ping de keepalive (e timeout de cada ping). */
   pingMs?: number;
   /** Espera antes de reconectar. */
   reconnectMs?: number;
}

/** Keepalive da conexão LISTEN: menor que o idle timeout típico de LB/NAT (~350s). */
const LISTEN_PING_MS = 30_000;
const LISTEN_RECONNECT_MS = 2_000;

/**
 * Loop da conexão `LISTEN circle_events` (#6, servidor). Três cuidados:
 *
 * - Ponto ÚNICO de reconexão (guardado): error/end/falha no connect/ping travado
 *   convergem aqui e agendam UMA reconexão, fechando o client morto.
 * - Keepalive: `select 1` periódico com timeout. Sem ele, uma conexão meio-aberta (LB
 *   ou NAT que derrubou o fluxo sem RST) nunca emitia erro — o pod ficava surdo aos
 *   outros pods para sempre, sem sinal nenhum.
 * - Resync: a partir da 2ª conexão, `onResync` avisa que eventos podem ter se perdido.
 *
 * Retorna `stop` (teste/HMR).
 */
export function runListener(opts: ListenerOptions): () => void {
   const pingMs = opts.pingMs ?? LISTEN_PING_MS;
   const reconnectMs = opts.reconnectMs ?? LISTEN_RECONNECT_MS;
   let stopped = false;
   let everConnected = false;
   let current: { dispose: () => void } | null = null;

   const connect = async (): Promise<void> => {
      if (stopped) return;
      const client = opts.makeClient();
      let pingTimer: ReturnType<typeof setInterval> | null = null;
      let disposed = false;
      const dispose = (): void => {
         if (disposed) return;
         disposed = true;
         if (pingTimer) clearInterval(pingTimer);
         client.removeAllListeners();
         // Um 'error' tardio do client descartado sem ouvinte derrubaria o processo.
         client.on('error', () => {});
         client.end().catch(() => {});
      };
      const scheduleReconnect = (): void => {
         if (disposed) return;
         dispose();
         if (stopped) return;
         setTimeout(() => {
            void connect();
         }, reconnectMs);
      };
      current = { dispose };
      client.on('error', scheduleReconnect);
      client.on('end', scheduleReconnect);
      client.on('notification', (msg) => {
         if (!msg.payload) return;
         try {
            opts.onEvent(JSON.parse(msg.payload) as CircleEvent);
         } catch {
            /* payload malformado — ignora */
         }
      });
      try {
         await client.connect();
         await client.query(`LISTEN ${CHANNEL}`);
      } catch {
         scheduleReconnect();
         return;
      }
      if (disposed) return;
      if (everConnected) opts.onResync();
      everConnected = true;
      pingTimer = setInterval(() => {
         let timeout: ReturnType<typeof setTimeout> | null = null;
         const expired = new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('ping timeout')), pingMs);
         });
         Promise.race([client.query('select 1'), expired])
            .catch(scheduleReconnect)
            .finally(() => {
               if (timeout) clearTimeout(timeout);
            });
      }, pingMs);
   };
   void connect();
   return () => {
      stopped = true;
      current?.dispose();
   };
}

/**
 * Conexão dedicada `LISTEN circle_events` (uma por pod). Recebe as notificações
 * dos OUTROS pods e faz fan-out local. Lazy: inicia no 1º `subscribe` em runtime real.
 * `pg`/`Client` são importados de forma preguiçosa pra não pesar no bundle e não rodar
 * em teste.
 */
async function startListener(): Promise<void> {
   if (g.__circleListenStarted || !notifyEnabled()) return;
   g.__circleListenStarted = true;
   const { Client } = await import('pg');
   runListener({
      makeClient: () => new Client({ connectionString: process.env.DATABASE_URL, keepAlive: true }),
      onEvent: (ev) => {
         const tagged = ev as CircleEvent & { __inst?: string };
         if (tagged.__inst === instanceId()) return; // já entregue localmente
         delete tagged.__inst;
         fanOutLocal(tagged);
      },
      // Só LOCAL: é este pod que ficou surdo; os clientes dele re-hidratam.
      onResync: () => fanOutLocal({ entity: 'resync', action: 'updated', ts: nextTs() }),
   });
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
   dispatchWebhooks(publishInternal(event));
}

/**
 * Só o realtime (SSE local + `pg_notify`), SEM webhook. Para sinais internos que não são
 * contrato externo: o coarse do import (#21 — um `issue.updated` sem id disparava webhook
 * vazio) e o aviso de job ao dono. Devolve o evento carimbado.
 */
export function publishInternal(event: Omit<CircleEvent, 'ts'>): CircleEvent {
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
   return full;
}

/**
 * Só a saída de webhooks, sem SSE. Para mutações em lote silenciosas no realtime (import,
 * #7): o cliente recebe um evento coarse no fim, mas webhook é contrato externo e quem
 * assina `issue.created` continua recebendo uma entrega por issue.
 */
export function dispatchWebhooksOnly(event: Omit<CircleEvent, 'ts'>): void {
   dispatchWebhooks({ ...event, ts: nextTs() });
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
