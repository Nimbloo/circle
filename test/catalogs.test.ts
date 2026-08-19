import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { listStatuses, listPriorities, listLabels, listHealthStates } from '@/lib/api/catalogs';

describe('catalogs', () => {
   it('seeds and lists all catalogs faithfully', async () => {
      const db = await makeTestDb();

      const statuses = await listStatuses(db);
      expect(statuses).toHaveLength(13);
      expect(statuses[0].id).toBe('in-progress'); // ordenado por position

      const priorities = await listPriorities(db);
      expect(priorities).toHaveLength(5);
      // ordem lógica: urgent tem o menor sortRank
      const urgent = priorities.find((p) => p.id === 'urgent');
      expect(urgent?.sortRank).toBe(0);

      const labels = await listLabels(db);
      expect(labels).toHaveLength(11);

      const healthStates = await listHealthStates(db);
      expect(healthStates).toHaveLength(4);
   });

   it('status categories are the closed set', async () => {
      const db = await makeTestDb();
      const cats = new Set((await listStatuses(db)).map((s) => s.category));
      expect([...cats].sort()).toEqual(
         ['backlog', 'canceled', 'completed', 'started', 'triage', 'unstarted'].sort()
      );
   });
});
