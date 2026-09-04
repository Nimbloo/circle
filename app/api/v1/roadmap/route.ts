import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getRoadmap } from '@/lib/api/roadmap';
import { scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SORTS = ['start-date', 'target-date', 'title'] as const;
type Sort = (typeof SORTS)[number];

export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const sp = new URL(req.url).searchParams;
      const { teamIds } = await scopeForEmail(db, email);
      const sort = sp.get('sort');
      return ok(
         await getRoadmap(db, {
            teamIds: teamIds ?? undefined,
            includeCompleted: sp.get('includeCompleted') !== 'false',
            sort: SORTS.includes(sort as Sort) ? (sort as Sort) : undefined,
         })
      );
   }, req);
}
