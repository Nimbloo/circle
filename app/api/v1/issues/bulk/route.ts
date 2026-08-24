import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { bulkUpdateIssues, bulkAddLabel } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
   statusId: z.string().min(1).max(64).optional(),
   priorityId: z.string().min(1).max(64).optional(),
   assigneeId: z.string().max(36).nullish(),
   projectId: z.string().max(36).nullish(),
   cycleId: z.string().max(36).nullish(),
   dueDate: z.string().date().nullish(),
   estimate: z.number().int().min(0).max(1000).nullish(),
});

const BulkSchema = z.object({
   ids: z.array(z.string().min(1).max(36)).min(1).max(500),
   patch: PatchSchema.optional(),
   addLabelId: z.string().min(1).max(64).optional(),
});

/**
 * Mutação em LOTE de issues: aplica um `patch` a todas as ids e/ou adiciona uma label
 * — numa transação, num único request (fim dos N PATCHes sequenciais da bulk bar).
 */
export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { ids, patch, addLabelId } = BulkSchema.parse(await req.json());
      const updated = patch ? await bulkUpdateIssues(db, ids, patch, email) : [];
      if (addLabelId) await bulkAddLabel(db, ids, addLabelId);
      return ok({ updated });
   });
}
