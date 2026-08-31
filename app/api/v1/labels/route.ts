import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { listLabels, createLabel } from '@/lib/api/labels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      await requireEmail(req);
      return ok(await listLabels(db));
   });
}

const CreateSchema = z.object({
   id: z.string().min(1).optional(),
   name: z.string().min(1),
   color: z.string().min(1),
});

export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const input = CreateSchema.parse(await req.json());
      const dto = await createLabel(db, input);
      return ok(dto);
   });
}
