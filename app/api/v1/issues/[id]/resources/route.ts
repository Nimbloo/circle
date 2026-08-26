import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { addIssueResource } from '@/lib/api/issue-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// `url` aceita URL absoluta (http/https) OU caminho interno relativo (ex.: um
// document da própria app: /[orgId]/document/[id]).
const AddSchema = z.object({
   kind: z.enum(['link', 'document']).default('link'),
   label: z.string().min(1).max(196),
   url: z
      .string()
      .min(1)
      .max(1024)
      .refine((u) => /^https?:\/\//.test(u) || u.startsWith('/'), {
         message: 'URL inválida (use http(s):// ou um caminho interno)',
      }),
});

/** Adiciona um resource (Add link / Add document) à issue. */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      const input = AddSchema.parse(await req.json());
      const dto = await addIssueResource(db, id, input);
      return ok(dto);
   });
}
