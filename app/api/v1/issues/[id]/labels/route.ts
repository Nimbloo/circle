import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { addLabel } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const AddLabelSchema = z.object({ labelId: z.string().min(1) });

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const { labelId } = AddLabelSchema.parse(await req.json());
      const dto = await addLabel(db, id, labelId, email);
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   }, req);
}
