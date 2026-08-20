import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, multi } from '@/lib/api/http';
import { listMembers, type MemberSort } from '@/lib/api/members';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const sp = new URL(req.url).searchParams;
      const [sort, dir] = (sp.get('sort') ?? 'name-asc').split('-') as [MemberSort, 'asc' | 'desc'];
      return ok(await listMembers(db, { role: multi(sp, 'role'), sort, dir }));
   });
}
