import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import type { Db } from '@/db';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { createAutomation, deleteAutomation, updateAutomation } from '@/lib/api/automations';

/**
 * A tela de automações do time escuta eventos (AUTOMATION_CHANGED no live-sync), mas o
 * CRUD não publicava nada: a regra criada por um admin só aparecia para outro após reload.
 */
let db: Db;
let eventos: CircleEvent[];
let parar: () => void;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   eventos = [];
   parar = subscribe((e) => eventos.push(e));
});
afterEach(() => parar());

describe('CRUD de automações publica evento (#28)', () => {
   it('create, update e delete publicam automation com id e teamId', async () => {
      const a = await createAutomation(db, 'CORE', {
         name: 'Auto',
         trigger: 'pr.merged',
         action: 'set_status',
         config: { statusId: 'done' },
      });
      await updateAutomation(db, a.id, { enabled: false });
      await deleteAutomation(db, a.id);
      const autos = eventos.filter((e) => e.entity === 'automation');
      expect(autos.map((e) => e.action)).toEqual(['created', 'updated', 'deleted']);
      expect(autos.every((e) => e.id === a.id && e.teamId === 'CORE')).toBe(true);
   });
});
