import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getMe, updateProfile } from '@/lib/api/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      return ok(await getMe(db, email));
   }, req);
}

const UpdateSchema = z.object({
   name: z.string().min(1).max(128).optional(),
   timezone: z.string().max(64).nullable().optional(),
});

/** PATCH /me — atualiza o próprio perfil (name/timezone). */
export async function PATCH(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const patch = UpdateSchema.parse(await req.json());
      return ok(await updateProfile(db, email, patch));
   }, req);
}
