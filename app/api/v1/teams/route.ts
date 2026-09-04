import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, multi, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { listTeams, createTeam, type TeamSort } from '@/lib/api/teams';
import { recordAudit } from '@/lib/api/audit';
import { visibleTeamIds } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const sp = new URL(req.url).searchParams;
      // `emailFromRequest` devolvia null sem sessão e o escopo virava `null` = irrestrito:
      // fail-OPEN. Um anônimo (bypass do middleware) listava todos os times. `requireEmail`
      // fecha: sem identidade, 401.
      const email = await requireEmail(req);
      const me = await getOrCreateUser(db, email);
      const meId = me.id;
      const [sort, dir] = (sp.get('sort') ?? 'name-asc').split('-') as [TeamSort, 'asc' | 'desc'];
      // Escopo de Guest (#100): a lista só traz os times de que ele participa.
      const teamIds = await visibleTeamIds(db, me);
      return ok(
         await listTeams(
            db,
            {
               membership: multi(sp, 'membership'),
               sort,
               dir,
               teamIds: teamIds ?? undefined,
            },
            meId
         )
      );
   }, req);
}

const CreateTeamSchema = z.object({
   id: z.string().min(2),
   name: z.string().min(1),
   icon: z.string().nullish(),
   color: z.string().nullish(),
   parentId: z.string().max(16).nullish(),
});

export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const input = CreateTeamSchema.parse(await req.json());
      // Passa o criador → entra automaticamente como membro (senão o time nasce órfão).
      const team = await createTeam(db, input, email);
      const actor = await getOrCreateUser(db, email);
      await recordAudit(db, {
         actorId: actor.id,
         action: 'team.create',
         targetType: 'team',
         targetId: team.id,
         meta: { name: team.name },
      });
      return ok(team);
   }, req);
}
