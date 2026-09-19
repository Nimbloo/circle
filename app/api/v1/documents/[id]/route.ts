import { z } from 'zod';
import { db } from '@/db';
import type { EditorDoc } from '@/lib/editor-doc';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { assertTeamInScope, scopeForEmail } from '@/lib/api/scope';
import { getDocument, updateDocument, deleteDocument } from '@/lib/api/documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Documento aberto (metadados + corpo). Convidado só lê documento de time do escopo. */
export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const dto = await getDocument(db, id);
      if (!dto) return notFound(`Documento '${id}' não encontrado`);
      assertTeamInScope((await scopeForEmail(db, email)).teamIds, dto.teamId);
      return ok(dto);
   }, req);
}

// Casca do doc do ProseMirror; a validação de schema (nós/marks) acontece ao derivar o texto.
const DocSchema = z
   .object({ type: z.literal('doc'), content: z.array(z.record(z.unknown())).optional() })
   .transform((doc) => doc as EditorDoc);

const UpdateSchema = z.object({
   name: z.string().min(1).optional(),
   icon: z.string().nullish(),
   pinned: z.boolean().optional(),
   // Corpo do documento (aditivo) + concorrência otimista, como na descrição da issue.
   descriptionDoc: DocSchema.nullish(),
   expectedDescriptionVersion: z.string().max(64).nullish(),
});

/** Devolve o documento atualizado (superset do `{ id }` de antes). */
export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateDocument(db, id, patch, email);
      return dto ? ok(dto) : notFound(`Documento '${id}' não encontrado`);
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const removed = await deleteDocument(db, id, email);
      return removed ? ok({ deleted: true }) : notFound(`Documento '${id}' não encontrado`);
   }, req);
}
