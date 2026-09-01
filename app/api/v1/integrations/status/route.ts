import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /integrations/status — quais integrações estão CONFIGURADAS (presença de env),
 * pra o Settings mostrar o badge "Conectado". Retorna só booleans — NUNCA os segredos.
 */
export async function GET(req: Request) {
   return handle(async () => {
      await requireEmail(req);
      return ok({
         github: !!process.env.GITHUB_TOKEN,
         slack: !!process.env.SLACK_WEBHOOK_URL,
         sentry: !!process.env.CIRCLE_SENTRY_CLIENT_SECRET,
         email: !!process.env.CIRCLE_MAIL_FROM,
      });
   }, req);
}
