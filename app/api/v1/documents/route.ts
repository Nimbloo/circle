import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { createDocPage } from '@/lib/api/doc-pages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateSchema = z.object({ title: z.string().max(512).optional() });

/** POST /documents — cria um documento e retorna {id, title, ...}. */
export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const input = CreateSchema.parse(await req.json().catch(() => ({})));
      const dto = await createDocPage(db, input, email);
      return ok(dto);
   });
}
