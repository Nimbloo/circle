import { z } from 'zod';
import { db } from '@/db';
import { handle, multi } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { requireApiToken } from '@/lib/api/public-auth';
import { assertTeamInScope } from '@/lib/api/scope';
import { createIssue, listIssues } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/v1/issues — lista as issues visíveis ao dono do token (escopo `read`).
 * Mesmo DTO da API interna; filtros por query (team/status/priority/project/labels/q).
 */
export async function GET(req: Request) {
   return handle(async () => {
      const ctx = await requireApiToken(db, req, 'read');
      const sp = new URL(req.url).searchParams;
      const limit = Number(sp.get('limit'));
      return ok(
         await listIssues(db, {
            team: sp.get('team') ?? undefined,
            status: multi(sp, 'status'),
            statusType: multi(sp, 'statusType'),
            priority: multi(sp, 'priority'),
            project: multi(sp, 'project'),
            labels: multi(sp, 'labels'),
            q: sp.get('q') ?? undefined,
            cursor: sp.get('cursor') ?? undefined,
            limit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50,
            teamIds: ctx.teamIds ?? undefined,
         })
      );
   }, req);
}

const createSchema = z.object({
   teamId: z.string().min(1),
   title: z.string().min(1).max(512),
   statusId: z.string().optional(),
   priorityId: z.string().optional(),
   assigneeId: z.string().nullable().optional(),
   projectId: z.string().nullable().optional(),
   labelIds: z.array(z.string()).optional(),
   dueDate: z.string().nullable().optional(),
   estimate: z.number().int().nullable().optional(),
   description: z.string().nullable().optional(),
   parentId: z.string().nullable().optional(),
});

/** POST /api/public/v1/issues — cria uma issue (escopo `write`). */
export async function POST(req: Request) {
   return handle(async () => {
      const ctx = await requireApiToken(db, req, 'write');
      const body = createSchema.parse(await req.json());
      assertTeamInScope(ctx.teamIds, body.teamId);
      return ok(
         await createIssue(
            db,
            { ...body, priorityId: body.priorityId ?? 'no-priority' },
            ctx.user.email
         )
      );
   }, req);
}
