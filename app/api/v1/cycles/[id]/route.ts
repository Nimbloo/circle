import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { assertTeamInScope, scopeForEmail } from '@/lib/api/scope';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { getCycle, updateCycle, deleteCycle } from '@/lib/api/cycles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      const dto = await getCycle(db, id);
      // Cycle pendura em time: por id direto, um convidado lia o ciclo de qualquer um (#100).
      if (dto) assertTeamInScope((await scopeForEmail(db, email)).teamIds, dto.teamId);
      return dto ? ok(dto) : notFound(`Cycle '${id}' não encontrado`);
   }, req);
}

const UpdateSchema = z.object({
   name: z
      .string()
      .trim()
      .min(1, 'name é obrigatório')
      .max(96, 'name deve ter no máximo 96 caracteres')
      .optional(),
   status: z.enum(['planned', 'upcoming', 'current', 'completed']).optional(),
   startDate: z.string().trim().date('use o formato YYYY-MM-DD').optional(),
   endDate: z.string().trim().date('use o formato YYYY-MM-DD').optional(),
   capacity: z
      .number({ invalid_type_error: 'capacity deve ser um inteiro maior ou igual a zero' })
      .int('capacity deve ser um inteiro maior ou igual a zero')
      .min(0, 'capacity deve ser um inteiro maior ou igual a zero')
      .optional(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateCycle(db, id, patch);
      return dto ? ok(dto) : notFound(`Cycle '${id}' não encontrado`);
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const removed = await deleteCycle(db, id);
      return removed ? ok({ deleted: true }) : notFound(`Cycle '${id}' não encontrado`);
   }, req);
}
