import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { syncFromGitHub } from '@/lib/api/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Dispara a ingestão de PRs do GitHub (config via env GITHUB_TOKEN + CIRCLE_GITHUB_REPOS). */
export async function POST(req: Request) {
   return handle(async () => {
      const email = requireEmail(req);
      if (!isAdmin(email))
         throw new ApiError(403, 'Apenas administradores podem disparar a sincronização');
      const synced = await syncFromGitHub(db);
      return ok({ synced });
   });
}
