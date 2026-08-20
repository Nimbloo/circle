import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { setRead } from '@/lib/api/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const PatchSchema = z.object({ read: z.boolean() });

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = requireEmail(req);
      const me = await getOrCreateUser(db, email);
      const { read } = PatchSchema.parse(await req.json());
      const okd = await setRead(db, id, read, me.id);
      return okd ? ok({ id, read }) : notFound(`Notificação '${id}' não encontrada`);
   });
}
