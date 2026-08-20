import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail, parseIssueListOptions } from '@/lib/api/http';
import { createIssue, listIssues } from '@/lib/api/issues';
import { emailFromRequest } from '@/lib/api/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const sp = new URL(req.url).searchParams;
      const meEmail = emailFromRequest(req) ?? undefined;
      const { opts } = parseIssueListOptions(sp, meEmail);
      return ok(await listIssues(db, opts));
   });
}

const CreateSchema = z.object({
   teamId: z.string().min(1).max(16),
   title: z.string().min(1).max(512),
   statusId: z.string().min(1).max(64),
   priorityId: z.string().min(1).max(64),
   assigneeId: z.string().max(36).nullish(),
   projectId: z.string().max(36).nullish(),
   cycleId: z.string().max(36).nullish(),
   labelIds: z.array(z.string().max(64)).optional(),
   dueDate: z.string().date().nullish(),
   estimate: z.number().int().min(0).max(1000).nullish(),
   description: z.string().max(10000).nullish(),
});

export async function POST(req: Request) {
   return handle(async () => {
      const email = requireEmail(req);
      const input = CreateSchema.parse(await req.json());
      const dto = await createIssue(db, input, email);
      return ok(dto);
   });
}
