import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { assertTeamInScope, scopeForEmail } from '@/lib/api/scope';
import { getView, updateView, deleteView } from '@/lib/api/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const { user: me, teamIds } = await scopeForEmail(db, email);
      const dto = await getView(db, id, me.id); // view pessoal só p/ o dono
      // View de TIME fora do escopo do convidado (#100): a listagem já filtrava, o acesso
      // por id direto não. Pessoal sem time já é barrada pelo `ownerId` no serviço.
      if (dto?.teamId) assertTeamInScope(teamIds, dto.teamId);
      return dto ? ok(dto) : notFound(`View '${id}' não encontrada`);
   }, req);
}

const UpdateSchema = z.object({
   name: z.string().min(1).optional(),
   // Compartilhamento: time que enxerga a view; `null` a torna pessoal.
   teamId: z.string().max(16).nullish(),
   description: z.string().nullish(),
   icon: z.string().nullish(),
   filter: z
      .object({
         statusCategories: z.array(z.string()).optional(),
         statusIds: z.array(z.string()).optional(),
         labelIds: z.array(z.string()).optional(),
         priorityIds: z.array(z.string()).optional(),
         hasProject: z.boolean().optional(),
         unassigned: z.boolean().optional(),
         q: z.string().max(200).optional(),
      })
      .optional(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateView(db, id, patch, email);
      return dto ? ok(dto) : notFound(`View '${id}' não encontrada`);
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const removed = await deleteView(db, id, email);
      return removed ? ok({ deleted: true }) : notFound(`View '${id}' não encontrada`);
   }, req);
}
