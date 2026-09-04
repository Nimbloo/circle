import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { deleteResource, updateResource } from '@/lib/api/project-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; rid: string }> };

const UpdateSchema = z.object({ label: z.string().min(1) });

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id, rid } = await params;
      const actorEmail = await requireEmail(req);
      const { label } = UpdateSchema.parse(await req.json());
      // `id` do projeto na URL é vinculante: resource de OUTRO projeto vira 404.
      const updated = await updateResource(db, rid, { label }, { projectId: id, actorEmail });
      return updated ? ok({ id: rid }) : notFound(`Resource '${rid}' não encontrado`);
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id, rid } = await params;
      const actorEmail = await requireEmail(req);
      const removed = await deleteResource(db, rid, { projectId: id, actorEmail });
      return removed ? ok({ deleted: true }) : notFound(`Resource '${rid}' não encontrado`);
   }, req);
}
