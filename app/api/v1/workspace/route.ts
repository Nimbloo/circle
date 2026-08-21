import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { bootstrapWorkspace } from '@/lib/api/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      return ok(await bootstrapWorkspace(db, email));
   });
}
