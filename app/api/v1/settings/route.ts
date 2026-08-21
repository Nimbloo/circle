import { db } from '@/db';
import { ok, problem } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import {
   getUserSettings,
   putUserSettings,
   SettingsSchema,
   MAX_SETTINGS_BYTES,
} from '@/lib/api/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /settings — settings do usuário corrente (objeto JSON; default {}). */
export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const user = await getOrCreateUser(db, email);
      return ok(await getUserSettings(db, user.id));
   });
}

/** PUT /settings — substitui as settings do usuário corrente (body = objeto, ≤32KB, schema fechado). */
export async function PUT(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const user = await getOrCreateUser(db, email);
      const raw = await req.text();
      if (Buffer.byteLength(raw, 'utf8') > MAX_SETTINGS_BYTES) {
         return problem(413, 'Payload Too Large', 'Corpo excede o limite de 32KB');
      }
      const parsed = SettingsSchema.parse(raw ? JSON.parse(raw) : {});
      return ok(await putUserSettings(db, user.id, parsed));
   });
}
