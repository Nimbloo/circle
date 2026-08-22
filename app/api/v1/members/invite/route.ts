import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { inviteUser } from '@/lib/api/users';
import { MEMBER_ROLES } from '@/lib/api/members';
import { sendEmail } from '@/lib/api/integrations/mailer';
import { ctaEmailHtml } from '@/lib/api/integrations/email-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InviteSchema = z.object({
   email: z.string().email(),
   role: z.enum(MEMBER_ROLES),
});

/** Convida um membro (admin-only). Cria/atualiza o app_user com a role e dispara o e-mail. */
export async function POST(req: Request) {
   return handle(async () => {
      const actor = await requireEmail(req);
      if (!(await isAdmin(actor, db))) throw new ApiError(403, 'Apenas admin');
      const { email, role } = InviteSchema.parse(await req.json());
      const user = await inviteUser(db, email, role);

      // Usuário já tem conta ativa: role (talvez) reconciliada, mas nenhum token/e-mail
      // de convite — o link de signup seria inútil (setPassword daria 409). Sinaliza ao admin.
      if (user.alreadyRegistered) {
         return ok({ id: user.id, email: user.email, role: user.role, alreadyRegistered: true });
      }

      // Link single-use do convite (e-mail + token no query string).
      const baseUrl = process.env.AUTH_URL || 'https://circle.nimbloo.ai';
      const signupUrl = `${baseUrl}/signup?email=${encodeURIComponent(user.email)}&token=${user.inviteToken}`;

      // Best-effort: convite por e-mail (no-op se o mailer não estiver configurado).
      const html = ctaEmailHtml({
         title: 'Você foi convidado para o Circle',
         intro: `Você foi convidado como ${role}. Defina sua senha para ativar sua conta e começar a trabalhar no Circle.`,
         buttonLabel: 'Definir minha senha',
         buttonUrl: signupUrl,
      });
      const mail = await sendEmail(user.email, 'Seu convite para o Circle', html).catch(() => ({
         sent: false as const,
      }));

      const body = { id: user.id, email: user.email, role: user.role };
      // Mailer indisponível → devolve o link pro admin copiar (nunca o token de outro fluxo).
      return ok(mail.sent ? body : { ...body, inviteUrl: signupUrl });
   });
}
