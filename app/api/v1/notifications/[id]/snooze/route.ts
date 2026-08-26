import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { snoozeNotification } from '@/lib/api/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// `until` = ISO datetime (adia até) ou null (desfaz o snooze).
const SnoozeSchema = z.object({ until: z.string().datetime().nullable() });

/** Adia (ou desfaz) uma notificação até `until`, escopada ao destinatário. */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const me = await getOrCreateUser(db, email);
      const { until } = SnoozeSchema.parse(await req.json());
      const done = await snoozeNotification(db, id, until ? new Date(until) : null, me.id);
      return done ? ok({ snoozedUntil: until }) : notFound(`Notificação '${id}' não encontrada`);
   });
}
