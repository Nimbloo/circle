import Link from 'next/link';
import { db } from '@/db';
import { getInviteByToken } from '@/lib/api/invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Landing do magic link. PÚBLICA (ver `PUBLIC_PAGE_PREFIXES` no middleware): quem chega
 * aqui ainda não tem sessão — é justamente o ponto.
 *
 * A página não autoriza nada: quem autoriza é o `signIn`, que consome o convite pelo
 * E-MAIL depois de o Keycloak confirmar quem a pessoa é. Aqui só validamos o token para
 * dizer se o link ainda vale e para quem, evitando mandar alguém a um login que vai negar.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
   const { token } = await params;
   const invite = await getInviteByToken(db, token);

   return (
      <main className="min-h-dvh flex items-center justify-center p-6 bg-background">
         <div className="w-full max-w-md rounded-xl border bg-container p-8 flex flex-col gap-5 text-center">
            {invite ? (
               <>
                  <h1 className="text-xl font-medium">Você foi convidado para o Circle</h1>
                  <p className="text-sm text-muted-foreground">
                     O convite é para{' '}
                     <span className="text-foreground font-medium">{invite.email}</span>. Entre com
                     a sua conta Nimbloo — precisa ser esse mesmo e-mail.
                  </p>
                  <Link
                     href="/login"
                     className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                     Entrar no Circle
                  </Link>
               </>
            ) : (
               <>
                  <h1 className="text-xl font-medium">Convite inválido ou expirado</h1>
                  <p className="text-sm text-muted-foreground">
                     Links de convite valem por 7 dias e só podem ser usados uma vez. Peça um novo
                     para quem te convidou.
                  </p>
                  <Link
                     href="/login"
                     className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
                  >
                     Ir para o login
                  </Link>
               </>
            )}
         </div>
      </main>
   );
}
