export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Convite nativo DESATIVADO. Acesso ao Circle agora é 100% via SSO Keycloak, gated
 * pelo grupo `app-circle` (concedido através do Orbis) — ver `auth.ts` (callback
 * `signIn`). Esta rota fica só como tombstone (410) pra qualquer cliente antigo que
 * ainda a chame; não toca o banco.
 */
export async function POST() {
   return Response.json(
      { error: 'Convites agora são feitos via Orbis (Keycloak). A rota nativa foi desativada.' },
      { status: 410 }
   );
}
