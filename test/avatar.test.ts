import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import { appUser } from '@/db/schema';
import { setAvatar, getAvatar, deleteAvatar, MAX_AVATAR_BASE64_BYTES } from '@/lib/api/avatar';
import type { Db } from '@/db';

// PNG 1x1 transparente (base64 válido) — payload mínimo pros testes.
const PNG_1X1 =
   'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_1X1}`;
// WebP 1x1 válido (magic RIFF….WEBP) — pro teste de upsert com content-type webp.
const WEBP_1X1 = 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

async function avatarUrlOf(db: Db, userId: string): Promise<string | null> {
   const rows = await db
      .select({ avatarUrl: appUser.avatarUrl })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
   return rows[0]?.avatarUrl ?? null;
}

describe('avatar service (setAvatar/getAvatar/deleteAvatar)', () => {
   it('grava a foto e aponta avatar_url pro endpoint de servir', async () => {
      const db = await makeTestDb();
      const uid = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });

      const url = await setAvatar(db, uid, PNG_DATA_URL, 'image/png');
      expect(url).toContain(`/api/v1/users/${uid}/avatar`);
      expect(await avatarUrlOf(db, uid)).toBe(url);

      const bytes = await getAvatar(db, uid);
      expect(bytes).not.toBeNull();
      expect(bytes?.contentType).toBe('image/png');
      expect(bytes?.data).toBe(PNG_1X1); // base64 puro, sem o prefixo data-URL
   });

   it('aceita base64 puro (sem prefixo data-URL)', async () => {
      const db = await makeTestDb();
      const uid = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      await setAvatar(db, uid, PNG_1X1, 'image/png');
      expect((await getAvatar(db, uid))?.data).toBe(PNG_1X1);
   });

   it('faz upsert: segunda gravação substitui (não duplica a PK)', async () => {
      const db = await makeTestDb();
      const uid = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      await setAvatar(db, uid, PNG_DATA_URL, 'image/png');
      await setAvatar(db, uid, `data:image/webp;base64,${WEBP_1X1}`, 'image/webp');
      const bytes = await getAvatar(db, uid);
      expect(bytes?.contentType).toBe('image/webp');
   });

   it('rejeita content-type fora da allow-list', async () => {
      const db = await makeTestDb();
      const uid = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      await expect(
         setAvatar(db, uid, `data:image/gif;base64,${PNG_1X1}`, 'image/gif')
      ).rejects.toMatchObject({ status: 400 });
   });

   it('rejeita quando o mime do data-URL não bate com o contentType', async () => {
      const db = await makeTestDb();
      const uid = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      await expect(
         setAvatar(db, uid, `data:image/png;base64,${PNG_1X1}`, 'image/webp')
      ).rejects.toMatchObject({ status: 400 });
   });

   it('rejeita bytes que não são imagem (magic-byte não bate)', async () => {
      const db = await makeTestDb();
      const uid = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      // base64 válido de "hello world" — rotulado como png, mas sem magic PNG.
      const notAnImage = Buffer.from('hello world hello').toString('base64');
      await expect(
         setAvatar(db, uid, `data:image/png;base64,${notAnImage}`, 'image/png')
      ).rejects.toMatchObject({ status: 400 });
   });

   it('rejeita base64 malformado', async () => {
      const db = await makeTestDb();
      const uid = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      await expect(
         setAvatar(db, uid, 'data:image/png;base64,!!!not-base64!!!', 'image/png')
      ).rejects.toMatchObject({ status: 400 });
   });

   it('rejeita payload acima do teto (413)', async () => {
      const db = await makeTestDb();
      const uid = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      // string base64 válida (múltiplo de 4) maior que o cap
      const huge = 'A'.repeat(MAX_AVATAR_BASE64_BYTES + 4);
      await expect(
         setAvatar(db, uid, `data:image/png;base64,${huge}`, 'image/png')
      ).rejects.toMatchObject({ status: 413 });
   });

   it('deleteAvatar remove a foto e zera avatar_url (→ null, UI mostra iniciais)', async () => {
      const db = await makeTestDb();
      const uid = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      await setAvatar(db, uid, PNG_DATA_URL, 'image/png');

      await deleteAvatar(db, uid);
      expect(await getAvatar(db, uid)).toBeNull();
      expect(await avatarUrlOf(db, uid)).toBeNull();
   });

   it('setAvatar em usuário inexistente falha (404)', async () => {
      const db = await makeTestDb();
      await expect(setAvatar(db, 'nao-existe', PNG_DATA_URL, 'image/png')).rejects.toMatchObject({
         status: 404,
      });
   });
});
