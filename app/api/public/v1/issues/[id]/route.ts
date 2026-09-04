import { z } from 'zod';
import { db } from '@/db';
import { handle } from '@/lib/api/http';
import { ok, notFound } from '@/lib/api/response';
import { requireApiToken } from '@/lib/api/public-auth';
import { assertIssueInScope } from '@/lib/api/scope';
import { getIssue, getIssueByIdentifier, updateIssue } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Aceita o id interno OU o identifier (`CORE-12`), como a API interna. */
async function resolve(id: string) {
   return (await getIssue(db, id)) ?? (await getIssueByIdentifier(db, id));
}

/** GET /api/public/v1/issues/{id|identifier} — detalhe da issue (escopo `read`). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
   return handle(async () => {
      const auth = await requireApiToken(db, req, 'read');
      const { id } = await ctx.params;
      await assertIssueInScope(db, auth.teamIds, id);
      const issue = await resolve(id);
      return issue ? ok(issue) : notFound('Issue não encontrada');
   }, req);
}

const patchSchema = z.object({
   title: z.string().min(1).max(512).optional(),
   statusId: z.string().optional(),
   priorityId: z.string().optional(),
   assigneeId: z.string().nullable().optional(),
   projectId: z.string().nullable().optional(),
   dueDate: z.string().nullable().optional(),
   estimate: z.number().int().nullable().optional(),
   parentId: z.string().nullable().optional(),
});

/** PATCH /api/public/v1/issues/{id|identifier} — atualização parcial (escopo `write`). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
   return handle(async () => {
      const auth = await requireApiToken(db, req, 'write');
      const { id } = await ctx.params;
      await assertIssueInScope(db, auth.teamIds, id);
      const existing = await resolve(id);
      if (!existing) return notFound('Issue não encontrada');
      const body = patchSchema.parse(await req.json());
      const updated = await updateIssue(db, existing.id, body, auth.user.email);
      return updated ? ok(updated) : notFound('Issue não encontrada');
   }, req);
}
