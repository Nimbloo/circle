import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { setRead, setSnooze } from '@/lib/api/notifications';
import { ApiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// PATCH aceita marcar lido E/OU adiar (snoozedUntil ISO ou null p/ desfazer).
const PatchSchema = z
   .object({
      read: z.boolean().optional(),
      snoozedUntil: z.string().datetime().nullable().optional(),
   })
   .refine((b) => b.read !== undefined || b.snoozedUntil !== undefined, {
      message: 'Informe read e/ou snoozedUntil',
   });

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const me = await getOrCreateUser(db, email);
      const body = PatchSchema.parse(await req.json());

      let touched = false;
      if (body.read !== undefined) touched = (await setRead(db, id, body.read, me.id)) || touched;
      if (body.snoozedUntil !== undefined) {
         const until = body.snoozedUntil ? new Date(body.snoozedUntil) : null;
         if (until && Number.isNaN(until.getTime()))
            throw new ApiError(400, 'snoozedUntil inválido');
         touched = (await setSnooze(db, id, until, me.id)) || touched;
      }
      return touched ? ok({ id, ...body }) : notFound(`Notificação '${id}' não encontrada`);
   }, req);
}
