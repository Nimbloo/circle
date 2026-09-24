import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { emailFromRequest } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { listActivityPage, type ActivityCursor } from '@/lib/api/issue-detail';
import { assertIssueInScope, scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** `before=<createdAt ISO>,<id>` — o item mais antigo que o cliente já tem. */
function parseCursor(raw: string | null): ActivityCursor | undefined {
   if (raw == null) return undefined;
   const comma = raw.indexOf(',');
   const createdAt = comma > 0 ? raw.slice(0, comma) : '';
   const id = comma > 0 ? raw.slice(comma + 1) : '';
   const date = new Date(createdAt);
   if (!id || id.length > 64 || Number.isNaN(date.getTime()))
      throw new ApiError(400, 'Cursor `before` inválido (esperado <createdAt>,<id>)');
   return { createdAt: date.toISOString(), id };
}

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      // O feed traz o CORPO dos comentários: sem escopo, uma issue alheia vazava inteira.
      const { teamIds } = await scopeForEmail(db, email);
      await assertIssueInScope(db, teamIds, id);
      const search = new URL(req.url).searchParams;
      const rawLimit = Number(search.get('limit'));
      const limit =
         Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(Math.floor(rawLimit), 500)
            : undefined;
      const before = parseCursor(search.get('before'));
      // O corpo continua sendo a lista (contrato); `meta.hasMore` é aditivo ("Show older").
      const page = await listActivityPage(
         db,
         id,
         (await emailFromRequest(req)) ?? undefined,
         limit,
         before
      );
      return ok(page.items, { hasMore: page.hasMore });
   }, req);
}
