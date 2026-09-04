import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import {
   AUTOMATION_ACTIONS,
   AUTOMATION_TRIGGERS,
   deleteAutomation,
   updateAutomation,
} from '@/lib/api/automations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string; id: string }> };

const PatchSchema = z.object({
   name: z.string().min(1).max(128).optional(),
   trigger: z.enum(AUTOMATION_TRIGGERS).optional(),
   action: z.enum(AUTOMATION_ACTIONS).optional(),
   config: z
      .object({
         toCategory: z.string().nullish(),
         triggerLabelId: z.string().nullish(),
         labelId: z.string().nullish(),
         statusId: z.string().nullish(),
         priorityId: z.string().nullish(),
         assigneeId: z.string().nullish(),
      })
      .optional(),
   enabled: z.boolean().optional(),
   position: z.number().int().min(0).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const dto = await updateAutomation(db, id, PatchSchema.parse(await req.json()));
      return dto ? ok(dto) : notFound(`Automação '${id}' não encontrada`);
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const removed = await deleteAutomation(db, id);
      return removed ? ok({ deleted: true }) : notFound(`Automação '${id}' não encontrada`);
   }, req);
}
