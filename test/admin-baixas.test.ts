import { describe, it, expect, vi, afterEach } from 'vitest';

const s3 = vi.hoisted(() => ({
   putAsset: vi.fn(async (key: string) => `https://cdn.test/${key}`),
   deleteAsset: vi.fn(async () => undefined),
}));
vi.mock('@/lib/api/s3-assets', () => ({ assetsConfigured: () => true, ...s3 }));
const mailer = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/api/integrations/mailer', () => mailer);

import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createEmoji } from '@/lib/api/emojis';
import { addTeamMember } from '@/lib/api/teams';
import { ApiError } from '@/lib/api/errors';

const PNG =
   'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

afterEach(() => {
   vi.unstubAllEnvs();
   vi.clearAllMocks();
});

describe('baixas de administração (Ad#21–40)', () => {
   it('emoji: corrida no shortcode vira 409 e o asset órfão do S3 é apagado', async () => {
      const db = await makeTestDb();
      const res = await Promise.allSettled([
         createEmoji(db, { shortcode: 'ok', dataUrl: PNG, contentType: 'image/png' }),
         createEmoji(db, { shortcode: 'ok', dataUrl: PNG, contentType: 'image/png' }),
      ]);
      const falhou = res.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(falhou.reason).toBeInstanceOf(ApiError);
      expect((falhou.reason as ApiError).status).toBe(409);
      expect(s3.deleteAsset).toHaveBeenCalledTimes(1);
   });

   it('adicionar membro não espera o SES (e-mail lento não segura a resposta)', async () => {
      vi.stubEnv('CIRCLE_MAIL_FROM', 'circle@nimbloo.ai');
      mailer.sendEmail.mockReturnValue(new Promise(() => {})); // nunca resolve
      const db = await makeTestDb();
      await seedTeam(db, 'CORE', 'Core');
      await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: [] });
      const r = await Promise.race([
         addTeamMember(db, 'CORE', 'ana@nimbloo.ai').then(() => 'ok'),
         new Promise((res) => setTimeout(() => res('preso'), 1500)),
      ]);
      expect(r).toBe('ok');
      expect(mailer.sendEmail).toHaveBeenCalledTimes(1);
   });
});
