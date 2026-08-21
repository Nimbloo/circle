import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle } from '@/lib/api/http';
import { setPassword } from '@/lib/api/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SignupSchema = z.object({
   email: z.string().email(),
   password: z.string().min(8).max(128),
   token: z.string().min(1),
});

/**
 * Define a senha de um usuário convidado, validando o token single-use do convite.
 * NÃO autentica — o front faz o signIn de credentials em seguida. 403 se o e-mail não
 * foi convidado ou o token é inválido/expirado; 409 se já tem senha.
 */
export async function POST(req: Request) {
   return handle(async () => {
      const { email, password, token } = SignupSchema.parse(await req.json());
      await setPassword(db, email, password, token);
      return ok({ email: email.trim().toLowerCase() });
   });
}
