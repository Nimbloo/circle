import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail, multi } from '@/lib/api/http';
import { listInitiatives, createInitiative } from '@/lib/api/initiatives';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const sp = new URL(req.url).searchParams;
      return ok(
         await listInitiatives(db, {
            status: multi(sp, 'status'),
            priority: multi(sp, 'priority'),
            owner: multi(sp, 'owner'),
            health: multi(sp, 'health'),
         })
      );
   });
}

const CreateSchema = z.object({
   slug: z.string().min(1),
   name: z.string().min(1),
   priorityId: z.string().min(1),
   healthId: z.string().min(1),
   status: z.string().optional(),
   description: z.string().nullish(),
   icon: z.string().nullish(),
   ownerId: z.string().nullish(),
   target: z.string().nullish(),
   projectIds: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
   return handle(async () => {
      await requireEmail(req);
      const input = CreateSchema.parse(await req.json());
      return ok(await createInitiative(db, input));
   });
}
