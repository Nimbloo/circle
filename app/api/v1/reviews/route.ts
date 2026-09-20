import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listReviews } from '@/lib/api/reviews';
import { getOrCreateUser } from '@/lib/api/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lê um inteiro >= min da query, aplicando default e teto. */
function intParam(raw: string | null, def: number, min: number, max: number): number {
   const n = Number.parseInt(raw ?? '', 10);
   if (Number.isNaN(n)) return def;
   return Math.min(Math.max(n, min), max);
}

export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const sp = new URL(req.url).searchParams;
      const limit = intParam(sp.get('limit'), 50, 1, 200);
      const offset = intParam(sp.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
      // `list` recorta por pessoa e precisa do handle do GitHub do viewer — a ponte
      // entre o PR (que guarda o login) e o usuario do Circle.
      const raw = sp.get('list');
      const list = raw === 'created' || raw === 'for-you' ? raw : undefined;
      const me = list ? await getOrCreateUser(db, email) : null;

      // `status` aceita CSV (`open,merged`): o filtro da lista é feito aqui, não na página.
      const statuses = (sp.get('status') ?? '')
         .split(',')
         .map((s) => s.trim())
         .filter((s) => s === 'open' || s === 'merged' || s === 'closed');
      const { items, total } = await listReviews(db, {
         statuses: statuses.length ? statuses : undefined,
         list,
         viewerLogin: me?.githubLogin ?? null,
         limit,
         offset,
      });
      return ok(items, { total, limit, offset });
   }, req);
}
