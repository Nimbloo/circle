import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { emailFromRequest } from '@/lib/api/auth';
import { listComments, addComment } from '@/lib/api/issue-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      return ok(await listComments(db, id, (await emailFromRequest(req)) ?? undefined));
   });
}

const CommentSchema = z.object({
   body: z.string().min(1).max(10000),
   parentId: z.string().min(1).nullable().optional(),
});

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const { body, parentId } = CommentSchema.parse(await req.json());
      return ok(await addComment(db, id, body, email, parentId ?? null));
   });
}
