import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getIssue, getIssueByIdentifier, updateIssue, deleteIssue } from '@/lib/api/issues';
import { assertIssueInScope, scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// UUID v4 (o id interno). Se o path NÃO for UUID, é um identifier (ex: ENG-42) —
// permite abrir /issue/ENG-42 direto sem precisar do store hidratado (elimina o waterfall).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      // Guest fora do time (#100): 403 antes de devolver qualquer campo da issue.
      const { teamIds } = await scopeForEmail(db, email);
      await assertIssueInScope(db, teamIds, id);
      const dto = UUID_RE.test(id) ? await getIssue(db, id) : await getIssueByIdentifier(db, id);
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   }, req);
}

const UpdateSchema = z.object({
   title: z.string().min(1).max(512).optional(),
   statusId: z.string().min(1).max(64).optional(),
   priorityId: z.string().min(1).max(64).optional(),
   assigneeId: z.string().max(36).nullish(),
   assigneeIds: z.array(z.string().min(1).max(36)).max(50).optional(),
   projectId: z.string().max(36).nullish(),
   cycleId: z.string().max(36).nullish(),
   dueDate: z.string().date().nullish(),
   estimate: z.number().int().min(0).max(1000).nullish(),
   snoozedUntil: z.string().datetime().nullish(),
   milestoneId: z.string().max(36).nullish(),
   parentId: z.string().max(36).nullish(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateIssue(db, id, patch, email);
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      const removed = await deleteIssue(db, id);
      return removed ? ok({ deleted: true }) : notFound(`Issue '${id}' não encontrada`);
   }, req);
}
