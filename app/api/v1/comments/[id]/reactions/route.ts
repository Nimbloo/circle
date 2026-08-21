import { z } from 'zod';
import { db } from '@/db';
import { ok, badRequest } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { addReaction, removeReaction } from '@/lib/api/issue-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const ReactionSchema = z.object({ emoji: z.string().min(1) });

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const { emoji } = ReactionSchema.parse(await req.json());
      await addReaction(db, id, emoji, email);
      return ok({ ok: true });
   });
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const emoji = new URL(req.url).searchParams.get('emoji');
      if (!emoji) return badRequest('emoji é obrigatório (?emoji=)');
      await removeReaction(db, id, emoji, email);
      return ok({ ok: true });
   });
}
