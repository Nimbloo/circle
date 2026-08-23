import { z } from 'zod';
import { db } from '@/db';
import { listStatuses } from '@/lib/api/catalogs';
import { createStatus, reorderStatuses } from '@/lib/api/statuses';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
   return handle(async () => ok(await listStatuses(db)));
}

const CreateSchema = z.object({
   name: z.string().min(1).max(128),
   color: z.string().min(1).max(16),
   category: z.string().min(1).max(32),
});

export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const input = CreateSchema.parse(await req.json());
      return ok(await createStatus(db, input));
   }, req);
}

const ReorderSchema = z.object({ ids: z.array(z.string()).min(1) });

/** PATCH /statuses — reordena o catálogo (position = índice). */
export async function PATCH(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const { ids } = ReorderSchema.parse(await req.json());
      return ok(await reorderStatuses(db, ids));
   }, req);
}
