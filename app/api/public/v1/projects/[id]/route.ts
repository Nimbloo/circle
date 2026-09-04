import { z } from 'zod';
import { db } from '@/db';
import { handle } from '@/lib/api/http';
import { ok, notFound } from '@/lib/api/response';
import { requireApiToken } from '@/lib/api/public-auth';
import { assertProjectInScope } from '@/lib/api/scope';
import { getProject, updateProject } from '@/lib/api/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/public/v1/projects/{id} — detalhe do projeto (escopo `read`). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
   return handle(async () => {
      const auth = await requireApiToken(db, req, 'read');
      const { id } = await ctx.params;
      await assertProjectInScope(db, auth.teamIds, id);
      const project = await getProject(db, id);
      return project ? ok(project) : notFound('Projeto não encontrado');
   }, req);
}

const patchSchema = z.object({
   name: z.string().min(1).max(196).optional(),
   statusId: z.string().optional(),
   priorityId: z.string().optional(),
   healthId: z.string().optional(),
   leadId: z.string().nullable().optional(),
   startDate: z.string().nullable().optional(),
   targetDate: z.string().nullable().optional(),
   initiativeId: z.string().nullable().optional(),
});

/** PATCH /api/public/v1/projects/{id} — atualização parcial (escopo `write`). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
   return handle(async () => {
      const auth = await requireApiToken(db, req, 'write');
      const { id } = await ctx.params;
      await assertProjectInScope(db, auth.teamIds, id);
      const body = patchSchema.parse(await req.json());
      const updated = await updateProject(db, id, body, auth.user.email);
      return updated ? ok(updated) : notFound('Projeto não encontrado');
   }, req);
}
