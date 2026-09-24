import { z } from 'zod';
import { db } from '@/db';
import { ok, badRequest } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { addReaction, removeReaction } from '@/lib/api/issue-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Mesmo limite da coluna (`comment_reaction.emoji` varchar(32)): acima disso é 400, não 500. */
const EmojiSchema = z.string().trim().min(1).max(32, 'emoji deve ter no máximo 32 caracteres');
const ReactionSchema = z.object({ emoji: EmojiSchema });

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const { emoji } = ReactionSchema.parse(await req.json());
      await addReaction(db, id, emoji, email);
      return ok({ ok: true });
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const raw = new URL(req.url).searchParams.get('emoji');
      if (!raw) return badRequest('emoji é obrigatório (?emoji=)');
      const emoji = EmojiSchema.parse(raw);
      await removeReaction(db, id, emoji, email);
      return ok({ ok: true });
   }, req);
}
