import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { listCyclesByTeam, createCycle, rolloverCyclesForTeam } from '@/lib/api/cycles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      // Auto-rollover lazy (#24): fecha cycles vencidos e carrega incompletas antes de listar.
      await rolloverCyclesForTeam(db, teamKey);
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
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const input = CreateSchema.parse(await req.json());
      const dto = await createCycle(db, { teamId: teamKey, ...input });
      return ok(dto);
   });
}
