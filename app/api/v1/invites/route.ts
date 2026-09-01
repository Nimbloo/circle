import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { createInvite, listInvites, inviteUrl } from '@/lib/api/invites';
import { getOrCreateUser } from '@/lib/api/users';
import { recordAudit } from '@/lib/api/audit';
import { sendEmail } from '@/lib/api/integrations/mailer';
import { ctaEmailHtml } from '@/lib/api/integrations/email-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /invites — convites do workspace (só admin). Nunca devolve o token. */
export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      return ok(await listInvites(db));
   }, req);
}

const CreateSchema = z.object({ email: z.string().email() });

/**
 * POST /invites — convida um e-mail @nimbloo.ai. Devolve o `token` UMA vez, para o
 * admin copiar o magic link; o e-mail é enviado em best-effort quando há remetente
 * configurado (falha de e-mail não derruba o convite — o link já está na resposta).
 */
export async function POST(req: Request) {
   return handle(async () => {
      const actor = await requireEmail(req);
      if (!(await isAdmin(actor, db))) throw new ApiError(403, 'Apenas admin');
      const { email } = CreateSchema.parse(await req.json());

      const dto = await createInvite(db, email, actor);
      const link = inviteUrl(dto.token!);

      const actorUser = await getOrCreateUser(db, actor);
      await recordAudit(db, {
         actorId: actorUser.id,
         action: 'invite.create',
         targetType: 'invite',
         targetId: dto.id,
         meta: { email: dto.email },
      });

      if (process.env.CIRCLE_MAIL_FROM) {
         try {
            await sendEmail(
               dto.email,
               'Seu acesso ao Circle',
               ctaEmailHtml({
                  title: 'Você foi convidado para o Circle',
                  intro: `${actorUser.name} liberou seu acesso ao Circle. Entre com sua conta Nimbloo.`,
                  buttonLabel: 'Entrar no Circle',
                  buttonUrl: link,
                  footnote: 'O link vale por 7 dias e só funciona para o seu e-mail @nimbloo.ai.',
               })
            );
         } catch (err) {
            console.error('[circle] envio do convite falhou (link segue válido):', err);
         }
      }

      return ok({ ...dto, url: link });
   }, req);
}
