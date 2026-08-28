import { z } from 'zod';
import { db } from '@/db';
import { ok, badRequest } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listFavorites, addFavorite, removeFavorite } from '@/lib/api/favorites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
   entityType: z.enum(['issue', 'project', 'view']),
   entityId: z.string().min(1).max(36),
});

export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      return ok(await listFavorites(db, email));
   });
}

export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { entityType, entityId } = BodySchema.parse(await req.json());
      return ok(await addFavorite(db, email, entityType, entityId));
   });
}

export async function DELETE(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const url = new URL(req.url);
      const entityType = url.searchParams.get('entityType') ?? '';
      const entityId = url.searchParams.get('entityId') ?? '';
      if (!entityType || !entityId) return badRequest('entityType e entityId são obrigatórios');
      return ok(await removeFavorite(db, email, entityType, entityId));
   });
}
