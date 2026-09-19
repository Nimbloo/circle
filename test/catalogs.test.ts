import { afterEach, describe, it, expect, vi } from 'vitest';
import { makeTestDb } from './helpers/db';
import {
   getCachedCatalogs,
   listStatuses,
   listPriorities,
   listLabels,
   listHealthStates,
   resetCatalogCache,
} from '@/lib/api/catalogs';
import { createLabel } from '@/lib/api/labels';
import { createStatus, deleteStatus, updateStatus } from '@/lib/api/statuses';
import { deleteLabel, updateLabel } from '@/lib/api/labels';

afterEach(() => {
   resetCatalogCache();
   vi.unstubAllEnvs();
});

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

   it('invalidates the enabled cache after status and label mutations', async () => {
      vi.stubEnv('CIRCLE_CATALOG_CACHE_ENABLED', 'true');
      const db = await makeTestDb();

      await getCachedCatalogs(db);
      const createdStatus = await createStatus(db, {
         name: 'Review',
         color: '#ffffff',
         category: 'started',
      });
      const afterStatus = await getCachedCatalogs(db);
      expect(afterStatus.statuses.some((row) => row.id === createdStatus.id)).toBe(true);
      await updateStatus(db, createdStatus.id, { name: 'Review updated' });
      expect(
         (await getCachedCatalogs(db)).statuses.find((row) => row.id === createdStatus.id)?.name
      ).toBe('Review updated');
      await deleteStatus(db, createdStatus.id);
      expect(
         (await getCachedCatalogs(db)).statuses.some((row) => row.id === createdStatus.id)
      ).toBe(false);

      const createdLabel = await createLabel(db, { name: 'Needs review', color: 'orange' });
      const afterLabel = await getCachedCatalogs(db);
      expect(afterLabel.labels.some((row) => row.id === createdLabel.id)).toBe(true);
      await updateLabel(db, createdLabel.id, { name: 'Needs review updated' });
      expect(
         (await getCachedCatalogs(db)).labels.find((row) => row.id === createdLabel.id)?.name
      ).toBe('Needs review updated');
      await deleteLabel(db, createdLabel.id);
      expect((await getCachedCatalogs(db)).labels.some((row) => row.id === createdLabel.id)).toBe(
         false
      );
   });
});
