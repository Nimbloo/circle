import type { Db } from '@/db';
import { hasCircleGroup, hasNimblooIdentity } from '@/auth.config';
import { consumeInvite } from './invites';
import { isDeactivatedEmail } from './members';

export type LoginDecision =
   /** Não é identidade Nimbloo verificada — nem convite dispensa isto. */
   | { allowed: false; reason: 'identity' }
   /** Identidade ok, mas sem grupo `app-circle` e sem convite válido. */
   | { allowed: false; reason: 'unauthorized' }
   /** Conta desativada por um admin (#100): nem grupo nem convite reabrem. */
   | { allowed: false; reason: 'deactivated' }
   /** Caminho normal: grupo concedido via Orbis. */
   | { allowed: true; via: 'group' }
   /** Exceção: convite pendente e válido, consumido agora (single-use). */
   | { allowed: true; via: 'invite'; role: string };

/**
 * Decide se um login Keycloak entra, e por qual caminho.
 *
 * Extraído do callback `signIn` (`auth.ts`) porque é A regra de autorização do produto e
 * precisa de teste direto — dentro do callback ela só seria exercitável através do
 * NextAuth. Ordem intencional:
 *
 *  1. IDENTIDADE é piso: domínio @nimbloo.ai + e-mail verificado pelo Keycloak. O convite
 *     libera AUTORIZAÇÃO, nunca autenticação — sem isso, um convite vazado viraria porta
 *     para qualquer e-mail.
 *  2. DESATIVAÇÃO (#100) vem antes de qualquer autorização: uma conta desativada não
 *     entra nem com grupo nem com convite — e um convite pendente NÃO é consumido.
 *  3. GRUPO `app-circle` é o caminho normal (concedido no Orbis).
 *  4. CONVITE é a exceção, e só é consumido se o grupo não resolveu — assim quem já tem
 *     acesso não queima o convite à toa. O consumo é atômico e single-use.
 */
export async function decideKeycloakLogin(
   db: Db,
   profile: unknown,
   email: string
): Promise<LoginDecision> {
   if (!hasNimblooIdentity(profile)) return { allowed: false, reason: 'identity' };
   if (await isDeactivatedEmail(db, email)) return { allowed: false, reason: 'deactivated' };
   if (hasCircleGroup(profile)) return { allowed: true, via: 'group' };
   const invited = await consumeInvite(db, email);
   // O papel do convite (Member|Guest, #100) provisiona o usuário no 1º login.
   if (invited) return { allowed: true, via: 'invite', role: invited.role };
   return { allowed: false, reason: 'unauthorized' };
}
