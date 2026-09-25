import { db } from '@/db';
import { handle, requireEmail } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { assertCanWriteTeam } from '@/lib/api/scope';
import {
   IMPORT_LIMITS,
   previewImport,
   validateImportCsv,
   validateImportRequestSize,
   type ImportMapping,
   type ImportSource,
} from '@/lib/api/import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lê o CSV do multipart (`file`) ou do corpo JSON (`csv`) — o wizard usa multipart. */
async function readCsv(
   req: Request
): Promise<{ csv: string; source: ImportSource; mapping?: ImportMapping; teamId?: string }> {
   const type = req.headers.get('content-type') ?? '';
   if (type.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) throw new ApiError(400, 'Arquivo CSV ausente (campo `file`)');
      if (file.size > IMPORT_LIMITS.maxBytes)
         throw new ApiError(413, 'CSV excede o limite de tamanho permitido');
      const rawMapping = form.get('mapping');
      return {
         csv: await file.text(),
         source: (String(form.get('source') ?? 'csv') as ImportSource) || 'csv',
         mapping:
            typeof rawMapping === 'string' && rawMapping
               ? (JSON.parse(rawMapping) as ImportMapping)
               : undefined,
         teamId: typeof form.get('teamId') === 'string' ? String(form.get('teamId')) : undefined,
      };
   }
   const body = (await req.json().catch(() => null)) as {
      csv?: string;
      source?: ImportSource;
      mapping?: ImportMapping;
      teamId?: string;
   } | null;
   if (!body?.csv) throw new ApiError(400, 'Informe `csv` (texto) ou envie multipart com `file`');
   return {
      csv: body.csv,
      source: body.source ?? 'csv',
      mapping: body.mapping,
      teamId: typeof body.teamId === 'string' ? body.teamId : undefined,
   };
}

/**
 * POST /import/preview — analisa o CSV (sem escrever), propõe o mapeamento de colunas
 * e devolve uma amostra resolvida contra os catálogos com os avisos.
 */
export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      validateImportRequestSize(req);
      const { csv, source, mapping, teamId } = await readCsv(req);
      validateImportCsv(csv);
      // O `existing` de cada linha consulta o `issue_import` do time: fora do escopo,
      // revelaria quais externalIds existem num time que o ator não enxerga.
      if (teamId) await assertCanWriteTeam(db, email, teamId);
      return ok(await previewImport(db, { csv, source, mapping, teamId: teamId || undefined }));
   }, req);
}
