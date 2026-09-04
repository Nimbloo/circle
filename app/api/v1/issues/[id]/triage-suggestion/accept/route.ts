import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { acceptTriageSuggestion } from '@/lib/api/triage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Overrides do "Edit" do card: o que vier substitui o que a sugestão propôs. */
const AcceptSchema = z
   .object({
      teamId: z.string().nullable().optional(),
      priorityId: z.string().nullable().optional(),
      labelIds: z.array(z.string()).optional(),
      duplicateIds: z.array(z.string()).optional(),
   })
   .default({});

/**
 * POST /issues/{id}/triage-suggestion/accept — aplica time/prioridade/labels, move
 * para o 1º status aberto, relaciona as duplicatas e carimba `applied_at`.
 */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const body = await req.json().catch(() => ({}));
      const input = AcceptSchema.parse(body ?? {});
      return ok(await acceptTriageSuggestion(db, id, email, input));
   }, req);
}
