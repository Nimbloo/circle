import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getInitiative, updateInitiative, deleteInitiative } from '@/lib/api/initiatives';
import { assertCanWriteProject, assertInitiativeInScope, scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      // Guest (#100): a initiative só é visível se algum projeto da subárvore está
      // num time dele — reusa exatamente a regra da listagem.
      const { teamIds } = await scopeForEmail(db, email);
      await assertInitiativeInScope(db, teamIds, id);
      const dto = await getInitiative(db, id);
      return dto ? ok(dto) : notFound(`Initiative '${id}' não encontrada`);
   }, req);
}

const UpdateSchema = z.object({
   name: z.string().min(1).max(196).optional(),
   description: z.string().nullish(),
   icon: z.string().max(64).nullish(),
   iconColor: z.string().max(32).nullish(),
   status: z.string().optional(),
   priorityId: z.string().optional(),
   healthId: z.string().optional(),
   ownerId: z.string().nullish(),
   target: z.string().max(64).nullish(),
   startDate: z.string().date().nullish(),
   targetDate: z.string().date().nullish(),
   projectIds: z.array(z.string()).optional(),
   labelIds: z.array(z.string().max(64)).max(100).optional(),
   parentId: z.string().max(36).nullish(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      // O e-mail vai adiante: é o ator do feed de alterações (igual à rota de project).
      const actor = await requireEmail(req);
      const patch = UpdateSchema.parse(await req.json());
      // Origem (a initiative atual) e destino (os projetos que passa a agregar).
      const scope = await scopeForEmail(db, actor);
      await assertInitiativeInScope(db, scope.teamIds, id);
      for (const projectId of patch.projectIds ?? [])
         await assertCanWriteProject(db, scope, projectId);
      const dto = await updateInitiative(db, id, patch, actor);
      return dto ? ok(dto) : notFound(`Initiative '${id}' não encontrada`);
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const { teamIds } = await scopeForEmail(db, email);
      await assertInitiativeInScope(db, teamIds, id);
      const removed = await deleteInitiative(db, id);
      return removed ? ok({ deleted: true }) : notFound(`Initiative '${id}' não encontrada`);
   }, req);
}
