import { afterEach, describe, expect, it } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { createProject } from '@/lib/api/projects';
import { setDependencies } from '@/lib/api/project-dependencies';

let stop: (() => void) | undefined;
afterEach(() => stop?.());

const base = {
   statusId: 'proj-in-progress',
   priorityId: 'high',
   healthId: 'on-track',
   teamId: 'CORE' as const,
};

/** pl#8: o evento de "Depends on" leva o `teamId` (constraint global dos eventos). */
describe('setDependencies — evento', () => {
   it('publica project updated com o teamId do projeto', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const a = await createProject(db, { name: 'A', ...base });
      const b = await createProject(db, { name: 'B', ...base });
      const events: CircleEvent[] = [];
      stop = subscribe((e) => events.push(e));

      await setDependencies(db, a.id, [b.id]);

      expect(events).toContainEqual(
         expect.objectContaining({ entity: 'project', action: 'updated', id: a.id, teamId: 'CORE' })
      );
   });
});
