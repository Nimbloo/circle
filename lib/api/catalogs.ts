import { asc } from 'drizzle-orm';
import type { Db } from '@/db';
import { status, projectStatus, priority, label, health } from '@/db/schema';
import { subscribe } from './events';

/** Catálogos (options dos filtros do frontend). Leituras simples ordenadas. */

export function listStatuses(db: Db) {
   return db.select().from(status).orderBy(asc(status.position));
}

export function listProjectStatuses(db: Db) {
   return db.select().from(projectStatus).orderBy(asc(projectStatus.position));
}

export function listPriorities(db: Db) {
   return db.select().from(priority).orderBy(asc(priority.position));
}

export function listLabels(db: Db) {
   return db.select().from(label).orderBy(asc(label.name));
}

export function listHealthStates(db: Db) {
   return db.select().from(health);
}

// ── Cache dos catálogos (TTL curto + invalidação por evento) ────────
type StatusRow = typeof status.$inferSelect;
type PriorityRow = typeof priority.$inferSelect;
type LabelRow = typeof label.$inferSelect;
type HealthRow = typeof health.$inferSelect;

export interface Catalogs {
   statuses: StatusRow[];
   priorities: PriorityRow[];
   labels: LabelRow[];
   health: HealthRow[];
}

const CACHE_TTL_MS = 30_000;
let cache: { at: number; data: Catalogs } | null = null;
/** Sobe a cada invalidação: leitura que começou antes dela não pode regravar o cache. */
let generation = 0;

subscribe((event) => {
   if (event.entity === 'catalog' || event.entity === 'label') resetCatalogCache();
});

/** Reseta o cache module-level (uso em testes). */
export function resetCatalogCache(): void {
   cache = null;
   generation++;
}

/**
 * Catálogos com cache module-level de TTL curto. Mutações invalidam a cópia
 * por evento local ou recebido pelo LISTEN entre pods; o TTL é o fallback.
 * Em teste (NODE_ENV==='test') o cache é desabilitado por padrão: cada caso usa um DB
 * PGlite distinto, então reconsultamos sempre para não vazar entre DBs. O env explícito
 * permite testar o comportamento real do cache.
 */
export async function getCachedCatalogs(db: Db): Promise<Catalogs> {
   const enabled =
      process.env.CIRCLE_CATALOG_CACHE_ENABLED === 'true' ||
      (process.env.CIRCLE_CATALOG_CACHE_ENABLED === undefined && process.env.NODE_ENV !== 'test');
   const now = Date.now();
   if (enabled && cache && now - cache.at < CACHE_TTL_MS) {
      return cache.data;
   }
   const startedAt = generation;
   const [statuses, priorities, labels, healthStates] = await Promise.all([
      db.select().from(status),
      db.select().from(priority),
      db.select().from(label),
      db.select().from(health),
   ]);
   const data: Catalogs = { statuses, priorities, labels, health: healthStates };
   if (enabled && startedAt === generation) cache = { at: now, data };
   return data;
}
