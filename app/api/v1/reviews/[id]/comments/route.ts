import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { addReviewComment, listReviewComments } from '@/lib/api/review-comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Veredito (approve/request_changes) pode ir sem texto; o serviço exige corpo só em `comment`.
const CommentSchema = z.object({
   body: z.string().max(10000).default(''),
   path: z.string().min(1).max(512).nullable().optional(),
   line: z.number().int().positive().nullable().optional(),
   kind: z.enum(['comment', 'approve', 'request_changes']).optional(),
});

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { id } = await params;
      return ok(await listReviewComments(db, decodeURIComponent(id)));
   }, req);
}

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      const input = CommentSchema.parse(await req.json());
      return ok(await addReviewComment(db, decodeURIComponent(id), input, email));
   }, req);
}
