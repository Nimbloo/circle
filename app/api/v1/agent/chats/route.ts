import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listAgentChats, sendAgentMessage } from '@/lib/api/agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /agent/chats — lista os chats do usuário (persistidos). */
export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      return ok(await listAgentChats(db, email));
   }, req);
}

const sendSchema = z.object({
   chatId: z.string().nullish(),
   content: z.string().min(1).max(8000),
});

/** POST /agent/chats — envia msg (cria o chat se chatId ausente); persiste e retorna a resposta. */
export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { chatId, content } = sendSchema.parse(await req.json());
      return ok(await sendAgentMessage(db, email, chatId ?? null, content));
   }, req);
}
