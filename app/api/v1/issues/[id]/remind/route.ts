import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { getIssue } from '@/lib/api/issues';
import { createNotification } from '@/lib/api/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const RemindSchema = z.object({ at: z.string().datetime() });

/**
 * POST /issues/{id}/remind — cria um lembrete: uma notificação para o usuário atual,
 * adiada (snoozedUntil) até o instante `at`. Aparece no inbox quando a hora chega.
 */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const { at } = RemindSchema.parse(await req.json());
      const issue = await getIssue(db, id);
      if (!issue) return notFound(`Issue '${id}' não encontrada`);
      const me = await getOrCreateUser(db, email);
      await createNotification(db, {
         recipientId: me.id,
         type: 'reminder',
         issueId: id,
         actorId: me.id,
         content: `Lembrete: ${issue.identifier} ${issue.title}`,
         snoozedUntil: new Date(at),
      });
      return ok({ at });
   });
}
