import { z } from 'zod';
import { db } from '@/db';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { ok } from '@/lib/api/response';
import { API_SCOPES, createApiToken, listApiTokens } from '@/lib/api/api-tokens';
import { recordAudit } from '@/lib/api/audit';
import { getOrCreateUser } from '@/lib/api/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
   name: z.string().min(1).max(128),
   scopes: z.array(z.enum(API_SCOPES as unknown as [string, ...string[]])).min(1),
});

/** GET /api-tokens — lista os tokens (sem o valor, que só existe na criação). */
export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      // A lista revela nome, prefixo, escopo e autor de toda credencial do workspace.
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      return ok(await listApiTokens(db));
   }, req);
}

/** POST /api-tokens — cria um token e devolve o valor em claro UMA única vez. */
export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const body = createSchema.parse(await req.json());
      const created = await createApiToken(
         db,
         { name: body.name, scopes: body.scopes as ('read' | 'write')[] },
         email
      );
      const actor = await getOrCreateUser(db, email);
      await recordAudit(db, {
         actorId: actor.id,
         action: 'api_token.create',
         targetType: 'api_token',
         targetId: created.id,
         meta: { name: created.name, scopes: created.scopes },
      });
      return ok(created);
   }, req);
}
