import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { sendSlack } from '@/lib/api/integrations/slack';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /integrations/slack/test — envia uma mensagem de teste ao Incoming Webhook do
 * Slack (admin), pra o usuário verificar a integração de UI. Retorna {sent, reason}.
 */
export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db)))
         throw new ApiError(403, 'Apenas administradores podem testar a integração');
      const res = await sendSlack(
         `:white_check_mark: Teste de integração do Circle — enviado por ${email}.`
      );
      return ok(res);
   }, req);
}
