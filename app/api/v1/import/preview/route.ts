import { db } from '@/db';
import { handle, requireEmail } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { ApiError } from '@/lib/api/errors';
import { previewImport, type ImportMapping, type ImportSource } from '@/lib/api/import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lê o CSV do multipart (`file`) ou do corpo JSON (`csv`) — o wizard usa multipart. */
async function readCsv(
   req: Request
): Promise<{ csv: string; source: ImportSource; mapping?: ImportMapping }> {
   const type = req.headers.get('content-type') ?? '';
   if (type.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) throw new ApiError(400, 'Arquivo CSV ausente (campo `file`)');
      const rawMapping = form.get('mapping');
      return {
         csv: await file.text(),
         source: (String(form.get('source') ?? 'csv') as ImportSource) || 'csv',
         mapping:
            typeof rawMapping === 'string' && rawMapping
               ? (JSON.parse(rawMapping) as ImportMapping)
               : undefined,
      };
   }
   const body = (await req.json().catch(() => null)) as {
      csv?: string;
      source?: ImportSource;
      mapping?: ImportMapping;
   } | null;
   if (!body?.csv) throw new ApiError(400, 'Informe `csv` (texto) ou envie multipart com `file`');
   return { csv: body.csv, source: body.source ?? 'csv', mapping: body.mapping };
}

/**
 * POST /import/preview — analisa o CSV (sem escrever), propõe o mapeamento de colunas
 * e devolve uma amostra resolvida contra os catálogos com os avisos.
 */
export async function POST(req: Request) {
   return handle(async () => {
      await requireEmail(req);
      const { csv, source, mapping } = await readCsv(req);
      return ok(await previewImport(db, { csv, source, mapping }));
   }, req);
}
