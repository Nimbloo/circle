import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { assertTeamInScope, scopeForEmail } from '@/lib/api/scope';
import { ApiError } from '@/lib/api/errors';
import { listTemplatesByTeam, createTemplate } from '@/lib/api/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { teamKey } = await params;
      // Guest fora do time (#100): 403, como em GET /teams/{key}.
      assertTeamInScope((await scopeForEmail(db, email)).teamIds, teamKey);
      return ok(await listTemplatesByTeam(db, teamKey));
   }, req);
}

const CreateSchema = z.object({
   name: z
      .string()
      .trim()
      .min(1, 'name é obrigatório')
      .max(128, 'name deve ter no máximo 128 caracteres'),
   title: z.string().trim().max(512).nullish(),
   description: z.string().nullish(),
   statusId: z.string().nullish(),
   priorityId: z.string().nullish(),
});

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const input = CreateSchema.parse(await req.json());
      const dto = await createTemplate(db, { teamId: teamKey, ...input });
      return ok(dto);
   }, req);
}
