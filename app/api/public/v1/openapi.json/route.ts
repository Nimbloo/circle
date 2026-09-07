import { db } from '@/db';
import { handle } from '@/lib/api/http';
import { requireApiClient } from '@/lib/api/public-auth';
import { OPENAPI_DOCUMENT } from '@/lib/api/openapi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/v1/openapi.json — contrato da API pública (objeto estático tipado).
 * Exige o mesmo token das demais rotas: quem não tem credencial não tem o que fazer
 * com o documento, e assim a superfície pública anônima segue sendo zero.
 */
export async function GET(req: Request) {
   return handle(async () => {
      await requireApiClient(db, req);
      return new Response(JSON.stringify(OPENAPI_DOCUMENT, null, 2), {
         headers: { 'content-type': 'application/json; charset=utf-8' },
      });
   }, req);
}
