export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Definição de senha via convite nativo DESATIVADA. Acesso ao Circle agora é 100% via
 * SSO Keycloak (sem senha local) — ver `auth.ts`. Tombstone (410) pra qualquer cliente
 * antigo que ainda chame esta rota; não toca o banco.
 */
export async function POST() {
   return Response.json(
      { error: 'Cadastro por senha foi desativado. O acesso agora é via SSO (Keycloak).' },
      { status: 410 }
   );
}
