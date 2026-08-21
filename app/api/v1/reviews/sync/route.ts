import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { syncFromGitHub } from '@/lib/api/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dispara a ingestão de PRs do GitHub (config via env GITHUB_TOKEN + CIRCLE_GITHUB_REPOS).
 * NÃO bloqueia a resposta: ~86 repos levam dezenas de segundos e estourariam o timeout do
 * gateway (504). Roda em background (Node standalone, sempre-ligado) e responde na hora; a
 * UI re-busca a lista após uma janela. Os upserts persistem incrementalmente.
 */
export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db)))
         throw new ApiError(403, 'Apenas administradores podem disparar a sincronização');
      void syncFromGitHub(db).catch((e) => console.error('[circle] github sync falhou:', e));
      return ok({ started: true });
   }, req);
}
