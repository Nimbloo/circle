/**
 * Autenticação da API pública: `Authorization: Bearer <access_token do Keycloak>`.
 *
 * SSO total — quem dá e tira acesso é o Keycloak, não o Circle. A credencial de uma
 * máquina é o token de um SERVICE ACCOUNT (client_credentials) do realm; o Circle não
 * emite nem guarda segredo nenhum. Três camadas, todas no IdP:
 *
 *  1. Ser token de SERVICE ACCOUNT (`client_credentials`) — token de pessoa é recusado
 *     nesta porta, gente entra pela sessão. Checado em `verifyKeycloakJwt`.
 *  2. Client role em `circle` (`member`/`admin`/`guest`) — sem papel, 403. É a mesma
 *     regra do login humano (`roleFromProfile`), então revogar a role no Keycloak
 *     desliga a máquina no próximo token, sem deploy.
 *  3. Escopo de TIMES do `app_user` correspondente — um service account com papel
 *     `guest` enxerga exatamente o que aquele convidado enxerga na UI (`scope.ts`).
 *
 * Não há dimensão de escopo `read`/`write` própria da API: a permissão de uma máquina é
 * a MESMA de uma pessoa com aquele papel. Read-only, se um dia for preciso, é um papel
 * novo no realm (como o `Viewer` do Grafana), não um escopo inventado aqui.
 */
import { roleFromProfile } from '@/auth.config';
import type { Db } from '@/db';
import { ApiError } from './errors';
import { identityFromPayload, verifyKeycloakJwt } from './keycloak-jwt';
import { visibleTeamIds } from './scope';
import { assertActiveUser, getOrCreateUser } from './users';

export interface PublicApiContext {
   /** `azp` do token — o client do realm que chamou (aparece no log/auditoria). */
   client: string | null;
   user: { id: string; role: string; email: string };
   /** Times visíveis ao chamador; `null` = sem restrição (Member/Admin). */
   teamIds: string[] | null;
}

/** Extrai o valor de `Authorization: Bearer <token>`, ou null. */
function bearer(req: Request): string | null {
   const h = req.headers.get('authorization');
   const m = h?.match(/^Bearer\s+(.+)$/i);
   return m ? m[1].trim() : null;
}

/**
 * 401 sem token válido do realm; 403 sem papel no Circle. Devolve o contexto da chamada
 * (usuário correspondente + escopo de times) para os handlers filtrarem no servidor.
 *
 * O papel do token é gravado no `app_user` a cada chamada (`syncRole`): promover ou
 * rebaixar no Keycloak vale na hora, e desativar a conta no Circle continua cortando
 * o acesso (`assertActiveUser`) mesmo com token válido.
 */
export async function requireApiClient(db: Db, req: Request): Promise<PublicApiContext> {
   const raw = bearer(req);
   if (!raw) throw new ApiError(401, 'Informe um token do Keycloak em Authorization: Bearer');

   const payload = await verifyKeycloakJwt(raw);
   if (!payload)
      throw new ApiError(401, 'Token inválido, expirado, ou que não é de um service account');

   const role = roleFromProfile(payload);
   if (!role)
      throw new ApiError(
         403,
         "Sem papel no Circle: atribua a client role 'member' (ou 'admin'/'guest') de `circle` a este service account no Keycloak"
      );

   const email = identityFromPayload(payload);
   if (!email) throw new ApiError(401, 'Token sem `azp` — não dá para saber qual client chamou');

   const user = await getOrCreateUser(db, email, role, { syncRole: true });
   assertActiveUser(user);

   return {
      client: typeof payload.azp === 'string' ? payload.azp : null,
      user: { id: user.id, role: user.role, email: user.email },
      teamIds: await visibleTeamIds(db, user),
   };
}
