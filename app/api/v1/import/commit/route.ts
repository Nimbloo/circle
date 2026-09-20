import { z } from 'zod';
import { db } from '@/db';
import { handle, requireEmail } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { assertCanWriteTeam } from '@/lib/api/scope';
import {
   IMPORT_LIMITS,
   IMPORT_SOURCES,
   startImportJob,
   validateImportCsv,
   validateImportRequestSize,
   type ImportMapping,
} from '@/lib/api/import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
   source: z.enum(IMPORT_SOURCES as unknown as [string, ...string[]]),
   csv: z.string().min(1).max(IMPORT_LIMITS.maxBytes),
   teamId: z.string().min(1),
   mapping: z.record(z.string().nullable()),
   createMissingLabels: z.boolean().optional(),
});

/**
 * POST /import/commit — valida o CSV e o mapeamento confirmado no wizard e cria um JOB em
 * background (#10) que cria/atualiza as issues. Devolve `{ jobId }` na hora; o progresso
 * e o resumo ficam em `GET /import/jobs/{jobId}` (e o dono recebe um evento SSE ao fim).
 */
export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      validateImportRequestSize(req);
      const body = bodySchema.parse(await req.json());
      validateImportCsv(body.csv, body.mapping as ImportMapping);
      // Gate explícito antes de criar o job (o serviço repete a checagem).
      await assertCanWriteTeam(db, email, body.teamId);
      const { jobId } = await startImportJob(
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
      return ok({ jobId });
   }, req);
}
