import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { scopeForEmail } from '@/lib/api/scope';
import { search, SEARCH_TYPES, type SearchEntityType } from '@/lib/api/search';
import { rerankSemantic } from '@/lib/api/search-semantic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/v1/search?q=&types=&teamId=&statusId=&limit=`
 * Busca full-text agrupada por tipo (issue|project|initiative|document).
 */
export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      // Escopo do ator (#100): sem isto a busca devolvia o workspace inteiro — e com
      // `?teamId=` o vazamento ficava dirigido ao time proibido. Era o achado principal
      // da auditoria e passou batido nas três levas anteriores.
      const { teamIds } = await scopeForEmail(db, email);
      const sp = new URL(req.url).searchParams;
      const raw = [...sp.getAll('types'), ...(sp.get('types')?.split(',') ?? [])];
      const types = [
         ...new Set(
            raw
               .map((t) => t.trim())
               .filter((t): t is SearchEntityType =>
                  (SEARCH_TYPES as readonly string[]).includes(t)
               )
         ),
      ];
      const limit = Number(sp.get('limit'));
      const result = await search(db, {
         teamIds: teamIds ?? undefined,
         q: sp.get('q') ?? '',
         types: types.length ? types : undefined,
         teamId: sp.get('teamId') ?? undefined,
         statusId: sp.get('statusId') ?? undefined,
         limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      });
      return ok(await rerankSemantic(result));
   }, req);
}
