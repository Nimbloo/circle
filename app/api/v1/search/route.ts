import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
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
      await requireEmail(req);
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
         q: sp.get('q') ?? '',
         types: types.length ? types : undefined,
         teamId: sp.get('teamId') ?? undefined,
         statusId: sp.get('statusId') ?? undefined,
         limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      });
      return ok(await rerankSemantic(result));
   }, req);
}
