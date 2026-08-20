import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listCyclesByTeam, createCycle } from '@/lib/api/cycles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      return ok(await listCyclesByTeam(db, teamKey));
   });
}

const CreateSchema = z.object({
   name: z.string().min(1),
   startDate: z.string().min(1),
   endDate: z.string().min(1),
   status: z.enum(['planned', 'upcoming', 'current', 'completed']).optional(),
   capacity: z.number().int().min(0).optional(),
});

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      requireEmail(req);
      const input = CreateSchema.parse(await req.json());
      const dto = await createCycle(db, { teamId: teamKey, ...input });
      return ok(dto);
   });
}
