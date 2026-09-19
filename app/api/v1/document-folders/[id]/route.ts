import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { deleteFolder, updateFolder } from '@/lib/api/documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
   name: z.string().trim().min(1).max(196).optional(),
   icon: z.string().max(16).nullish(),
});

/** Renomeia/troca o ícone da pasta de documentos (membro do time). */
export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateFolder(db, id, patch, email);
      return dto ? ok(dto) : notFound(`Pasta '${id}' não encontrada`);
   }, req);
}

/** Exclui a pasta e os documentos dela (se o ator puder excluir todos). */
export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const removed = await deleteFolder(db, id, email);
      return removed ? ok({ deleted: true }) : notFound(`Pasta '${id}' não encontrada`);
   }, req);
}
