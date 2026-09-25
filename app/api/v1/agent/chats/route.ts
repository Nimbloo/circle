import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listAgentChats, sendAgentMessage } from '@/lib/api/agent';
import { AGENT_MESSAGE_MAX_LENGTH } from '@/lib/agent-limits';

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
   content: z.string().min(1).max(AGENT_MESSAGE_MAX_LENGTH),
});

/** POST /agent/chats — envia msg (cria o chat se chatId ausente); persiste e retorna a resposta. */
export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { chatId, content } = sendSchema.parse(await req.json());
      // `req.signal` (Fetch API padrão): dispara se o cliente abortar o fetch ("Parar
      // resposta") — propagado pro turno, que repassa pro SDK do Bedrock se ele aceitar.
      return ok(await sendAgentMessage(db, email, chatId ?? null, content, { signal: req.signal }));
   }, req);
}
