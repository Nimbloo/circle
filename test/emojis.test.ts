import { describe, it, expect, vi } from 'vitest';

// Mocka o storage S3/CDN — testamos a lógica sem rede.
vi.mock('@/lib/api/s3-assets', () => ({
   assetsConfigured: () => true,
   putAsset: vi.fn(async (key: string) => `https://cdn.test/${key}`),
   deleteAsset: vi.fn(async () => undefined),
}));

import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import { createEmoji, listEmojis, deleteEmoji, normalizeShortcode } from '@/lib/api/emojis';
import { ApiError } from '@/lib/api/errors';

const PNG =
   'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('custom emojis', () => {
   it('normaliza shortcode (:Code: → code, só [a-z0-9_], máx 30)', () => {
      expect(normalizeShortcode(':Deploy!:')).toBe('deploy');
      expect(normalizeShortcode('  MY EMOJI ')).toBe('myemoji');
      expect(normalizeShortcode('a'.repeat(40)).length).toBe(30);
   });

   it('cria emoji (upload S3) e lista', async () => {
      const db = await makeTestDb();
      const uid = await seedUser(db, { email: 'dev@nimbloo.ai', name: 'Dev' });

      const e = await createEmoji(db, {
         shortcode: ':deploy:',
         dataUrl: PNG,
         contentType: 'image/png',
         createdBy: uid,
      });
      expect(e.shortcode).toBe('deploy');
      expect(e.url).toContain('https://cdn.test/emojis/');

      const list = await listEmojis(db);
      expect(list).toHaveLength(1);

      expect(await deleteEmoji(db, e.id)).toBe(true);
      expect(await listEmojis(db)).toHaveLength(0);
   });

   it('rejeita shortcode duplicado (409) e tipo inválido', async () => {
      const db = await makeTestDb();
      await createEmoji(db, { shortcode: 'ship', dataUrl: PNG, contentType: 'image/png' });
      await expect(
         createEmoji(db, { shortcode: 'ship', dataUrl: PNG, contentType: 'image/png' })
      ).rejects.toMatchObject({ status: 409 });
      await expect(
         createEmoji(db, { shortcode: 'x', dataUrl: PNG, contentType: 'application/pdf' })
      ).rejects.toThrow(ApiError);
   });
});
