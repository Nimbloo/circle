import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { dismissTriageSuggestion } from '@/lib/api/triage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** POST /issues/{id}/triage-suggestion/dismiss — descarta a sugestão (a issue fica). */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      return ok(await dismissTriageSuggestion(db, id, email));
   }, req);
}
