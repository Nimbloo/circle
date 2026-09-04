/**
 * Autenticação da API pública (#101): `Authorization: Bearer circle_<...>`.
 *
 * As rotas sob `/api/public/v1` não têm sessão — o token É a credencial. Cada request
 * resolve o token, checa o escopo (`read`/`write`) e devolve o escopo de TIMES do dono
 * do token, para que um token de um usuário `Guest` enxergue exatamente o que ele
 * enxerga na UI (`lib/api/scope.ts`). Nada de rate limit aqui: isso é na borda.
 */
import type { Db } from '@/db';
import { authenticateApiToken, type ApiScope } from './api-tokens';
import { ApiError } from './errors';
import { visibleTeamIds } from './scope';

export interface PublicApiContext {
   tokenId: string;
   scopes: ApiScope[];
   user: { id: string; role: string; email: string };
   /** Times visíveis ao dono do token; `null` = sem restrição (Member/Admin). */
   teamIds: string[] | null;
}

/** Extrai o valor de `Authorization: Bearer <token>`, ou null. */
function bearer(req: Request): string | null {
   const h = req.headers.get('authorization');
   const m = h?.match(/^Bearer\s+(.+)$/i);
   return m ? m[1].trim() : null;
}

/**
 * 401 sem token válido, 403 sem o escopo pedido. Devolve o contexto da chamada
 * (usuário dono do token + escopo de times) para os handlers filtrarem no servidor.
 */
export async function requireApiToken(
   db: Db,
   req: Request,
   scope: ApiScope
): Promise<PublicApiContext> {
   const raw = bearer(req);
   if (!raw) throw new ApiError(401, 'Informe um token em Authorization: Bearer');
   const auth = await authenticateApiToken(db, raw);
   if (!auth) throw new ApiError(401, 'Token inválido ou revogado');
   if (!auth.scopes.includes(scope))
      throw new ApiError(403, `Token sem o escopo '${scope}' necessário`);
   return { ...auth, teamIds: await visibleTeamIds(db, auth.user) };
}
