import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getMe, getOrCreateUser } from '@/lib/api/users';
import { setAvatar, deleteAvatar } from '@/lib/api/avatar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UploadSchema = z.object({
   dataUrl: z.string().min(1).max(1_400_000), // ~512KB base64 + overhead do prefixo data-URL
   contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
});

/** POST /me/avatar — envia a foto de perfil do usuário corrente. Retorna o MeDto. */
export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { dataUrl, contentType } = UploadSchema.parse(await req.json());
      const user = await getOrCreateUser(db, email);
      await setAvatar(db, user.id, dataUrl, contentType);
      return ok(await getMe(db, email));
   });
}

/** DELETE /me/avatar — remove a foto e volta pro avatar gerado. Retorna o MeDto. */
export async function DELETE(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const user = await getOrCreateUser(db, email);
      await deleteAvatar(db, user.id);
      return ok(await getMe(db, email));
   });
}
