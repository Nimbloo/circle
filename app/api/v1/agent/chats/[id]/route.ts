import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getAgentChat } from '@/lib/api/agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** GET /agent/chats/{id} — mensagens de um chat (valida dono). */
export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const chat = await getAgentChat(db, email, id);
      return chat ? ok(chat) : notFound('Chat não encontrado');
   }, req);
}
