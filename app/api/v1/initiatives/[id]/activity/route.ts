import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listInitiativeActivity } from '@/lib/api/initiatives';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /initiatives/{id}/activity — feed de alterações (o "changed status, owner").
 * Distinto de `/updates`, que são os posts editoriais de health escritos à mão.
 */
export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { id } = await params;
      return ok(await listInitiativeActivity(db, id));
   });
}
