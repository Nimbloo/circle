import { z } from 'zod';
import type { EditorDoc } from '@/lib/editor-doc';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getProjectDetail, updateProjectDetail } from '@/lib/api/project-detail';
import type { ContentBlock } from '@/data/issue-details';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { id } = await params;
      const dto = await getProjectDetail(db, id);
      return dto ? ok(dto) : notFound(`Project '${id}' não encontrado`);
   }, req);
}

// Casca do doc do ProseMirror; a validação de schema (nós/marks) acontece ao derivar o texto.
const DocSchema = z
   .object({ type: z.literal('doc'), content: z.array(z.record(z.unknown())).optional() })
   .transform((doc) => doc as EditorDoc);

const PatchSchema = z.object({
   summary: z.string().max(1024).nullish(),
   description: z.array(z.unknown()).nullish(),
   descriptionDoc: DocSchema.nullish(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      const patch = PatchSchema.parse(await req.json());
      const dto = await updateProjectDetail(db, id, {
         summary: patch.summary,
         description: patch.description as ContentBlock[] | null | undefined,
         descriptionDoc: patch.descriptionDoc,
      });
      return dto ? ok(dto) : notFound(`Project '${id}' não encontrado`);
   }, req);
}
