import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { getCycleSettings, updateCycleSettings } from '@/lib/api/cycles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const dto = await getCycleSettings(db, teamKey);
      return dto ? ok(dto) : notFound(`Team '${teamKey}' não existe`);
   });
}

const PatchSchema = z.object({
   enabled: z.boolean().optional(),
   durationWeeks: z.number().int().min(1).max(8).optional(),
   startDay: z.number().int().min(0).max(6).optional(),
   cooldownWeeks: z.number().int().min(0).max(4).optional(),
   upcomingCount: z.number().int().min(1).max(15).optional(),
   autoAdd: z.boolean().optional(),
   estimatesEnabled: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const patch = PatchSchema.parse(await req.json());
      return ok(await updateCycleSettings(db, teamKey, patch));
   });
}
