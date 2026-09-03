import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { generateReviewGuide } from '@/lib/api/review-guide';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Gera (ou regenera) o guia do review a partir do diff e devolve `{ sections, generatedAt, model }`. */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { id } = await params;
      return ok(await generateReviewGuide(db, decodeURIComponent(id)));
   }, req);
}
