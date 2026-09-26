import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { bulkUpdateIssues } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z
   .object({
      statusId: z.string().min(1).max(64).optional(),
      priorityId: z.string().min(1).max(64).optional(),
      assigneeId: z.string().max(36).nullish(),
      assigneeIds: z.array(z.string().min(1).max(36)).max(50).optional(),
   })
   .strict()
   .refine((p) => Object.keys(p).length > 0, 'patch vazio');

const BulkSchema = z.object({
   updates: z
      .array(z.object({ id: z.string().min(1).max(36), patch: PatchSchema }))
      .min(1)
      .max(250),
});

/** Ações em lote (#30): um patch por issue, numa transação só (tudo ou nada). */
export async function PATCH(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { updates } = BulkSchema.parse(await req.json());
      return ok({ issues: await bulkUpdateIssues(db, updates, email) });
   }, req);
}
