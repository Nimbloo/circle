import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail, multi } from '@/lib/api/http';
import { listProjects, createProject, type ProjectSort } from '@/lib/api/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const sp = new URL(req.url).searchParams;
      const [sort, dir] = (sp.get('sort') ?? 'title-asc').split('-') as [
         ProjectSort,
         'asc' | 'desc',
      ];
      return ok(
         await listProjects(db, {
            tab: (sp.get('tab') as 'all' | 'active') ?? undefined,
            health: multi(sp, 'health'),
            priority: multi(sp, 'priority'),
            team: sp.get('team') ?? undefined,
            initiative: sp.get('initiative') ?? undefined,
            includeClosed: sp.get('includeClosed') === 'true' ? true : undefined,
            sort,
            dir,
         })
      );
   });
}

const CreateSchema = z.object({
   name: z.string().min(1),
   statusId: z.string().min(1),
   priorityId: z.string().min(1),
   healthId: z.string().min(1),
   teamId: z.string().min(1),
   leadId: z.string().nullish(),
   iconKey: z.string().nullish(),
   percentComplete: z.number().int().min(0).max(100).optional(),
   startDate: z.string().nullish(),
   targetDate: z.string().nullish(),
   initiativeId: z.string().nullish(),
   labelIds: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
   return handle(async () => {
      requireEmail(req);
      const input = CreateSchema.parse(await req.json());
      return ok(await createProject(db, input));
   });
}
