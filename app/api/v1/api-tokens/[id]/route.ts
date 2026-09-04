import { db } from '@/db';
import { handle, requireEmail } from '@/lib/api/http';
import { ok, notFound } from '@/lib/api/response';
import { revokeApiToken } from '@/lib/api/api-tokens';
import { recordAudit } from '@/lib/api/audit';
import { getOrCreateUser } from '@/lib/api/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** DELETE /api-tokens/{id} — revoga (não apaga: o histórico de uso fica auditável). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await ctx.params;
      const revoked = await revokeApiToken(db, id);
      if (!revoked) return notFound('Token não encontrado');
      const actor = await getOrCreateUser(db, email);
      await recordAudit(db, {
         actorId: actor.id,
         action: 'api_token.revoke',
         targetType: 'api_token',
         targetId: id,
      });
      return ok({ revoked: true });
   }, req);
}
