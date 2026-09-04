import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, multi, requireEmail } from '@/lib/api/http';
import { listMembers, type MemberSort } from '@/lib/api/members';
import { scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const sp = new URL(req.url).searchParams;
      const [sort, dir] = (sp.get('sort') ?? 'name-asc').split('-') as [MemberSort, 'asc' | 'desc'];
      const { teamIds } = await scopeForEmail(db, email);
      return ok(
         await listMembers(db, {
            role: multi(sp, 'role'),
            sort,
            dir,
            teamIds: teamIds ?? undefined,
            // Desativado (#100) sai da lista no SERVIDOR; quem quer ver o desligado
            // (tela de membros, filtro "Show deactivated") pede explicitamente.
            includeDeactivated: sp.get('includeDeactivated') === 'true',
         })
      );
   }, req);
}
