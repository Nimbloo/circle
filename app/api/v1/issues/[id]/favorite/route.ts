import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { toggleFavorite } from '@/lib/api/favorites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Alterna o favorito da issue para o usuário atual. Retorna o novo estado. */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const user = await getOrCreateUser(db, await requireEmail(req));
      const favorited = await toggleFavorite(db, id, user.id);
      return ok({ favorited });
   });
}
