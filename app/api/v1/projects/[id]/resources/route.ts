import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listResources, addResource } from '@/lib/api/project-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      return ok(await listResources(db, id));
   });
}

const CreateSchema = z.object({
   label: z.string().min(1).max(196),
   url: z.string().min(1).max(1024),
});

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      const input = CreateSchema.parse(await req.json());
      return ok(await addResource(db, id, input));
   });
}
