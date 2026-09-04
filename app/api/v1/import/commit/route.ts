import { z } from 'zod';
import { db } from '@/db';
import { handle, requireEmail } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { commitImport, IMPORT_SOURCES, type ImportMapping } from '@/lib/api/import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
   source: z.enum(IMPORT_SOURCES as unknown as [string, ...string[]]),
   csv: z.string().min(1),
   teamId: z.string().min(1),
   mapping: z.record(z.string().nullable()),
   createMissingLabels: z.boolean().optional(),
});

/**
 * POST /import/commit — cria (ou atualiza, em re-import) as issues do CSV com o
 * mapeamento confirmado no wizard. Devolve o resumo (criadas/atualizadas/ignoradas/erros).
 */
export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const body = bodySchema.parse(await req.json());
      const result = await commitImport(
         db,
         {
            source: body.source as 'csv' | 'linear' | 'jira',
            csv: body.csv,
            teamId: body.teamId,
            mapping: body.mapping as ImportMapping,
            createMissingLabels: body.createMissingLabels,
         },
         email
      );
      return ok(result);
   }, req);
}
