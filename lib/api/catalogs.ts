import { asc } from 'drizzle-orm';
import type { Db } from '@/db';
import { status, priority, label, health } from '@/db/schema';

/** Catálogos (options dos filtros do frontend). Leituras simples ordenadas. */

export function listStatuses(db: Db) {
   return db.select().from(status).orderBy(asc(status.position));
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
