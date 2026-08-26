import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { addIssueReaction, removeIssueReaction } from '@/lib/api/issue-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const BodySchema = z.object({ emoji: z.string().min(1).max(32) });

/** Adiciona uma reaction (emoji) à issue pelo usuário atual. */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const { emoji } = BodySchema.parse(await req.json());
      await addIssueReaction(db, id, emoji, email);
      return ok({ ok: true });
   });
}

/** Remove a reaction do usuário atual (emoji via query `?emoji=`). */
export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const emoji = new URL(req.url).searchParams.get('emoji') ?? '';
      await removeIssueReaction(db, id, emoji, email);
      return ok({ ok: true });
   });
}
