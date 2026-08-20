import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle } from '@/lib/api/http';
import { issueMatrix } from '@/lib/api/aggregations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const sp = new URL(req.url).searchParams;
      return ok(await issueMatrix(db, { team: sp.get('team') ?? undefined }));
   });
}
