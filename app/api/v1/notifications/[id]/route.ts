import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { setRead } from '@/lib/api/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const PatchSchema = z.object({ read: z.boolean() });

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      requireEmail(req);
      const { read } = PatchSchema.parse(await req.json());
      const okd = await setRead(db, id, read);
      return okd ? ok({ id, read }) : notFound(`Notificação '${id}' não encontrada`);
   });
}
