import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocka o storage S3/CDN — testamos a rota sem rede.
vi.mock('@/lib/api/s3-assets', () => ({
   assetsConfigured: () => true,
   putAsset: vi.fn(async (key: string) => `https://cdn.test/${key}`),
   deleteAsset: vi.fn(async () => undefined),
}));

import { POST } from '@/app/api/v1/uploads/route';
import { MAX_UPLOAD_BYTES } from '@/lib/api/uploads';
import { makeTestDb } from './helpers/db';
import { __setTestDb } from '@/db';

// `requireEmail` consulta o banco (gate de conta desativada, #100): a rota precisa
// de um db, mesmo esta suíte não gravando nada.
beforeEach(async () => {
   __setTestDb(await makeTestDb(false));
});
afterEach(() => {
   __setTestDb(null);
});

const PNG =
   'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function post(body: unknown, email: string | null = 'dev@nimbloo.ai') {
   return new Request('http://x/api/v1/uploads', {
      method: 'POST',
      headers: {
         'content-type': 'application/json',
         ...(email ? { 'x-forwarded-email': email } : {}),
      },
      body: JSON.stringify(body),
   });
}

describe('POST /uploads (imagens do editor) #16', () => {
   it('sobe a imagem em uploads/<uuid>.<ext> e devolve a URL do CDN', async () => {
      const res = await POST(post({ dataUrl: PNG, contentType: 'image/png', fileName: 'a.png' }));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.url).toMatch(/^https:\/\/cdn\.test\/uploads\/[0-9a-f-]{36}\.png$/);
   });

   it('sem autenticação → 401', async () => {
      const res = await POST(post({ dataUrl: PNG, contentType: 'image/png' }, null));
      expect(res.status).toBe(401);
   });

   it('tipo fora da allow-list (svg) → 400', async () => {
      const res = await POST(
         post({ dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+', contentType: 'image/svg+xml' })
      );
      expect(res.status).toBe(400);
   });

   it('contentType diferente do data-URL → 400', async () => {
      const res = await POST(post({ dataUrl: PNG, contentType: 'image/jpeg' }));
      expect(res.status).toBe(400);
   });

   it('acima de 5 MB → 413', async () => {
      const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 1).toString('base64');
      const res = await POST(post({ dataUrl: big, contentType: 'image/png' }));
      expect(res.status).toBe(413);
   });
});
