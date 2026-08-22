import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, multi, requireEmail } from '@/lib/api/http';
import { emailFromRequest } from '@/lib/api/auth';
import { getOrCreateUser } from '@/lib/api/users';
import { listTeams, createTeam, type TeamSort } from '@/lib/api/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const sp = new URL(req.url).searchParams;
      const email = await emailFromRequest(req);
      const meId = email ? (await getOrCreateUser(db, email)).id : undefined;
      const [sort, dir] = (sp.get('sort') ?? 'name-asc').split('-') as [TeamSort, 'asc' | 'desc'];
      return ok(await listTeams(db, { membership: multi(sp, 'membership'), sort, dir }, meId));
   });
}

const CreateTeamSchema = z.object({
   id: z.string().min(2),
   name: z.string().min(1),
   icon: z.string().nullish(),
   color: z.string().nullish(),
});

export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const input = CreateTeamSchema.parse(await req.json());
      // Passa o criador → entra automaticamente como membro (senão o time nasce órfão).
      return ok(await createTeam(db, input, email));
   });
}
