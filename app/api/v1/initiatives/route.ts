import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail, multi } from '@/lib/api/http';
import { listInitiatives, createInitiative } from '@/lib/api/initiatives';
import { assertCanWriteProject, scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const sp = new URL(req.url).searchParams;
      const { teamIds } = await scopeForEmail(db, email);
      return ok(
         await listInitiatives(db, {
            teamIds: teamIds ?? undefined,
            status: multi(sp, 'status'),
            priority: multi(sp, 'priority'),
            owner: multi(sp, 'owner'),
            health: multi(sp, 'health'),
         })
      );
   }, req);
}

const CreateSchema = z.object({
   slug: z.string().min(1).max(96),
   name: z.string().min(1).max(196),
   priorityId: z.string().min(1),
   healthId: z.string().min(1),
   status: z.string().optional(),
   description: z.string().nullish(),
   icon: z.string().max(64).nullish(),
   iconColor: z.string().max(32).nullish(),
   ownerId: z.string().nullish(),
   target: z.string().max(64).nullish(),
   startDate: z.string().date().nullish(),
   targetDate: z.string().date().nullish(),
   projectIds: z.array(z.string()).optional(),
   labelIds: z.array(z.string().max(64)).max(100).optional(),
   parentId: z.string().max(36).nullish(),
});

export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const input = CreateSchema.parse(await req.json());
      // A initiative não tem time próprio: quem define o alcance são os PROJETOS
      // vinculados. Escopo resolvido uma vez e reusado na lista.
      const scope = await scopeForEmail(db, email);
      for (const projectId of input.projectIds ?? [])
         await assertCanWriteProject(db, scope, projectId);
      return ok(await createInitiative(db, input));
   }, req);
}
