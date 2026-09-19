import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { createLabelGroup, listLabelGroups } from '@/lib/api/labels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      await requireEmail(req);
      return ok(await listLabelGroups(db));
   }, req);
}

const CreateSchema = z.object({
   name: z.string().trim().min(1).max(128),
   color: z.string().trim().min(1).max(32).optional(),
});

export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const input = CreateSchema.parse(await req.json());
      return ok(await createLabelGroup(db, input));
   }, req);
}
