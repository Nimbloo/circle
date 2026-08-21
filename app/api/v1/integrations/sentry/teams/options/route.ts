import { db } from '@/db';
import { teamOptions } from '@/lib/api/integrations/sentry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Opções do select "Team" do formulário de criação do Sentry. O Sentry busca a URI do
 * campo (GET/POST, sem body assinável) e espera `[{label, value}]`. Baixa sensibilidade
 * (só nomes/ids de time) — não exige assinatura; o create/link é que valida HMAC.
 */
async function options(): Promise<Response> {
   const opts = await teamOptions(db);
   return new Response(JSON.stringify(opts), {
      status: 200,
      headers: { 'content-type': 'application/json' },
   });
}

export const GET = options;
export const POST = options;
