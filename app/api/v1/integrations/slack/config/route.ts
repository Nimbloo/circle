import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { getSlackConfig, updateSlackConfig } from '@/lib/api/integrations/slack';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      await requireEmail(req);
      return ok(await getSlackConfig(db));
   });
}

const PatchSchema = z.object({
   onIssueCreated: z.boolean().optional(),
   onIssueCompleted: z.boolean().optional(),
   onIssueAssigned: z.boolean().optional(),
   onPrMerged: z.boolean().optional(),
});

export async function PATCH(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const patch = PatchSchema.parse(await req.json());
      return ok(await updateSlackConfig(db, patch));
   });
}
