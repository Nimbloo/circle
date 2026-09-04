import { z } from 'zod';
import { db } from '@/db';
import { handle, multi } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { requireApiToken } from '@/lib/api/public-auth';
import { assertTeamInScope } from '@/lib/api/scope';
import { createProject, listProjects } from '@/lib/api/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/public/v1/projects — projetos visíveis ao dono do token (escopo `read`). */
export async function GET(req: Request) {
   return handle(async () => {
      const ctx = await requireApiToken(db, req, 'read');
      const sp = new URL(req.url).searchParams;
      return ok(
         await listProjects(db, {
            team: sp.get('team') ?? undefined,
            initiative: sp.get('initiative') ?? undefined,
            health: multi(sp, 'health'),
            priority: multi(sp, 'priority'),
            teamIds: ctx.teamIds ?? undefined,
         })
      );
   }, req);
}

const createSchema = z.object({
   name: z.string().min(1).max(196),
   teamId: z.string().min(1),
   statusId: z.string().min(1),
   priorityId: z.string().min(1),
   healthId: z.string().min(1),
   leadId: z.string().nullable().optional(),
   startDate: z.string().nullable().optional(),
   targetDate: z.string().nullable().optional(),
   initiativeId: z.string().nullable().optional(),
});

/** POST /api/public/v1/projects — cria um projeto (escopo `write`). */
export async function POST(req: Request) {
   return handle(async () => {
      const ctx = await requireApiToken(db, req, 'write');
      const body = createSchema.parse(await req.json());
      assertTeamInScope(ctx.teamIds, body.teamId);
      return ok(await createProject(db, body));
   }, req);
}
