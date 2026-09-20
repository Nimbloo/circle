import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { getMember, setMemberDeactivated, MEMBER_ROLES } from '@/lib/api/members';
import { getOrCreateUser } from '@/lib/api/users';
import { recordAudit } from '@/lib/api/audit';
import { scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      const { user, teamIds } = await scopeForEmail(db, email);
      const dto = await getMember(db, id, teamIds);
      if (!dto) return notFound(`Membro '${id}' não encontrado`);
      // Guest só vê quem compartilha um time visível (Ad#27), como na listagem.
      if (teamIds !== null && dto.teamIds.length === 0 && user.id !== id)
         throw new ApiError(403, 'Fora do seu escopo de acesso');
      return ok(dto);
   }, req);
}

// `role` e `deactivated` (#100) são exclusivos: um PATCH faz uma coisa por vez.
const UpdateSchema = z
   .object({ role: z.enum(MEMBER_ROLES).optional(), deactivated: z.boolean().optional() })
   .refine((v) => v.role !== undefined || v.deactivated !== undefined, {
      message: 'informe `role` ou `deactivated`',
   });

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const patch = UpdateSchema.parse(await req.json());
      const actor = await getOrCreateUser(db, email);

      if (patch.deactivated !== undefined) {
         // Auto-desativação travaria o próprio admin fora do workspace.
         if (patch.deactivated && actor.id === id)
            throw new ApiError(400, 'Você não pode desativar a própria conta');
         const dto = await setMemberDeactivated(db, id, patch.deactivated);
         if (dto) {
            await recordAudit(db, {
               actorId: actor.id,
               action: patch.deactivated ? 'member.deactivate' : 'member.reactivate',
               targetType: 'member',
               targetId: id,
               meta: { email: dto.email },
            });
         }
         return dto ? ok(dto) : notFound(`Membro '${id}' não encontrado`);
      }

      // Papel (#52, decisão do usuário): a fonte única é o Keycloak/Orbis, re-sincronizado
      // a cada login — uma troca aqui seria desfeita no acesso seguinte. O break-glass
      // `CIRCLE_ADMIN_EMAILS` continua valendo, mas também não passa por esta rota.
      throw new ApiError(
         409,
         'O papel vem do Keycloak (Orbis) e é sincronizado a cada login: altere-o lá.'
      );
   }, req);
}
