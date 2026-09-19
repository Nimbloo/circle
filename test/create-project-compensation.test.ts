import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
   create: vi.fn(),
   updateDetail: vi.fn(),
   addMilestone: vi.fn(),
   remove: vi.fn(),
}));

vi.mock('@/lib/client', () => ({
   api: {
      projects: {
         create: api.create,
         updateDetail: api.updateDetail,
         addMilestone: api.addMilestone,
         remove: api.remove,
      },
   },
}));

import {
   persistNewProject,
   type CreateProgress,
} from '@/components/common/projects/create-project-persist';

const plan = {
   input: {
      name: 'P',
      teamId: 'CORE',
      statusId: 's',
      priorityId: 'p',
      healthId: 'h',
   },
   detail: { summary: 'resumo', descriptionDoc: null },
   milestones: [
      { name: 'M1', targetDate: null },
      { name: 'M2', targetDate: null },
   ],
};

beforeEach(() => {
   for (const fn of Object.values(api)) fn.mockReset();
   api.create.mockResolvedValue({ id: 'proj-1' });
   api.updateDetail.mockResolvedValue({});
   api.addMilestone.mockResolvedValue({});
   api.remove.mockResolvedValue({ deleted: true });
});

describe('criar projeto com compensação (#42)', () => {
   it('falha no milestone desfaz o projeto criado; nova tentativa não duplica', async () => {
      api.addMilestone.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'));
      const progress: { current: CreateProgress | null } = { current: null };

      await expect(persistNewProject(plan, progress)).rejects.toThrow('boom');
      expect(api.remove).toHaveBeenCalledWith('proj-1');
      expect(progress.current).toBeNull();

      api.create.mockResolvedValueOnce({ id: 'proj-2' });
      await expect(persistNewProject(plan, progress)).resolves.toEqual({ id: 'proj-2' });
      expect(api.create).toHaveBeenCalledTimes(2);
   });

   it('se a compensação também falha, a nova tentativa RETOMA o projeto criado', async () => {
      api.addMilestone.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'));
      api.remove.mockRejectedValue(new Error('offline'));
      const progress: { current: CreateProgress | null } = { current: null };

      await expect(persistNewProject(plan, progress)).rejects.toThrow('boom');
      expect(progress.current?.project).toEqual({ id: 'proj-1' });

      await expect(persistNewProject(plan, progress)).resolves.toEqual({ id: 'proj-1' });
      expect(api.create).toHaveBeenCalledTimes(1);
      expect(api.updateDetail).toHaveBeenCalledTimes(1);
      // M1 já tinha sido gravado: só o M2 é refeito.
      expect(api.addMilestone.mock.calls.map((c) => c[1].name)).toEqual(['M1', 'M2', 'M2']);
      expect(progress.current).toBeNull();
   });
});
