import { asc } from 'drizzle-orm';
import type { Db } from '@/db';
import { status, projectStatus, priority, label, health } from '@/db/schema';

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

// ── Cache dos catálogos (semeados e fixos) ──────────────────────────
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

/** Reseta o cache module-level (uso em testes). */
export function resetCatalogCache(): void {
   cache = null;
}

/**
 * Catálogos com cache module-level de TTL curto — são semeados e fixos, então
 * evitamos reconsultá-los a cada listagem de issue. Reconsulta após o TTL.
 * Em teste (NODE_ENV==='test') o cache é desabilitado: cada caso usa um DB
 * PGlite distinto, então reconsultamos sempre para não vazar entre DBs.
 */
export async function getCachedCatalogs(db: Db): Promise<Catalogs> {
   const disabled = process.env.NODE_ENV === 'test';
   const now = Date.now();
   if (!disabled && cache && now - cache.at < CACHE_TTL_MS) {
      return cache.data;
   }
   const [statuses, priorities, labels, healthStates] = await Promise.all([
      db.select().from(status),
      db.select().from(priority),
      db.select().from(label),
      db.select().from(health),
   ]);
   const data: Catalogs = { statuses, priorities, labels, health: healthStates };
   if (!disabled) cache = { at: now, data };
   return data;
}
