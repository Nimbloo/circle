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
      // Split no ÚLTIMO hífen: senão 'start-date-asc' virava sort='start'/dir='date'
      // (os sorts hifenizados start-date/target-date ficavam inacessíveis via API).
      const rawSort = sp.get('sort') ?? 'title-asc';
      const dash = rawSort.lastIndexOf('-');
      const sort = rawSort.slice(0, dash) as ProjectSort;
      const dir = rawSort.slice(dash + 1) as 'asc' | 'desc';
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
   name: z.string().min(1).max(196),
   statusId: z.string().min(1).max(64),
   priorityId: z.string().min(1).max(64),
   healthId: z.string().min(1).max(64),
   teamId: z.string().min(1).max(16),
   leadId: z.string().max(36).nullish(),
   iconKey: z.string().max(64).nullish(),
   percentComplete: z.number().int().min(0).max(100).optional(),
   startDate: z.string().date().nullish(),
   targetDate: z.string().date().nullish(),
   initiativeId: z.string().max(36).nullish(),
   labelIds: z.array(z.string().max(64)).optional(),
});

export async function POST(req: Request) {
   return handle(async () => {
      await requireEmail(req);
      const input = CreateSchema.parse(await req.json());
      return ok(await createProject(db, input));
   });
}
