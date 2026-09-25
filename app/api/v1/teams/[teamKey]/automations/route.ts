import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { assertTeamInScope, scopeForEmail } from '@/lib/api/scope';
import { ApiError } from '@/lib/api/errors';
import { assertAssignableUsers } from '@/lib/api/members';
import {
   AUTOMATION_ACTIONS,
   AUTOMATION_TRIGGERS,
   createAutomation,
   listTeamAutomations,
} from '@/lib/api/automations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

// Não exportar: o Next valida que um `route.ts` só exporte handlers e config, e um
// export a mais quebra o build (`OmitWithTag ... does not satisfy '{ [x: string]: never }'`).
const ConfigSchema = z.object({
   toCategory: z.string().nullish(),
   triggerLabelId: z.string().nullish(),
   labelId: z.string().nullish(),
   statusId: z.string().nullish(),
   priorityId: z.string().nullish(),
   assigneeId: z.string().nullish(),
});

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { teamKey } = await params;
      // Guest fora do time (#100): 403, como em GET /teams/{key}.
      assertTeamInScope((await scopeForEmail(db, email)).teamIds, teamKey);
      return ok(await listTeamAutomations(db, teamKey));
   }, req);
}

const CreateSchema = z.object({
   name: z
      .string()
      .trim()
      .min(1, 'name é obrigatório')
      .max(128, 'name deve ter no máximo 128 caracteres'),
   trigger: z.enum(AUTOMATION_TRIGGERS),
   action: z.enum(AUTOMATION_ACTIONS),
   config: ConfigSchema.optional(),
   enabled: z.boolean().optional(),
});

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const input = CreateSchema.parse(await req.json());
      // Desativado (#100) não recebe atribuição — nem via regra de automação, que
      // continuaria despejando issues numa conta desligada.
      await assertAssignableUsers(db, [input.config?.assigneeId]);
      return ok(await createAutomation(db, teamKey, input));
   }, req);
}
