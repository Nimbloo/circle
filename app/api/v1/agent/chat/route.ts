import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { runAgent, type AgentChatMessage } from '@/lib/api/agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/agent/chat — chat do Agent com IA real (Bedrock/Claude via IRSA) e
 * contexto do workspace. Body: { messages: [{role, content}] } (diálogo até agora,
 * última = usuário). Autenticado (middleware default-deny + requireEmail). Retorna { reply }.
 */
const bodySchema = z.object({
   messages: z
      .array(
         z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string().max(8000),
         })
      )
      .min(1)
      .max(40),
});

export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { messages } = bodySchema.parse(await req.json());
      const reply = await runAgent(db, email, messages as AgentChatMessage[]);
      return ok({ reply });
   }, req);
}
