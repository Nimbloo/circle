import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { getOrCreateUser } from '@/lib/api/users';
import { listEmojis, createEmoji } from '@/lib/api/emojis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
   return handle(async () => ok(await listEmojis(db)));
}

const CreateSchema = z.object({
   shortcode: z.string().min(1).max(64),
   dataUrl: z.string().min(1),
   contentType: z.string().min(1).max(64),
});

export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const input = CreateSchema.parse(await req.json());
      const me = await getOrCreateUser(db, email);
      return ok(await createEmoji(db, { ...input, createdBy: me.id }));
   }, req);
}
