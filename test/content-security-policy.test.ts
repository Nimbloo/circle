import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, createNonce } from '../lib/security/content-security-policy';

const base = { cdnUrl: 'https://cdn.example.com', nonce: 'abc123' };

describe('content security policy', () => {
   it('produção só executa script com o nonce da requisição, sem unsafe-inline', () => {
      const production = buildContentSecurityPolicy({ ...base, isDevelopment: false });
      expect(production).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
      expect(production).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(production).not.toContain("'unsafe-eval'");
   });

   it('desenvolvimento libera só o eval do React Refresh', () => {
      const development = buildContentSecurityPolicy({ ...base, isDevelopment: true });
      expect(development).toContain(
         "script-src 'self' 'nonce-abc123' 'strict-dynamic' 'unsafe-eval'"
      );
   });

   it('nonce muda a cada requisição', () => {
      const a = createNonce();
      expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      expect(createNonce()).not.toBe(a);
   });

   it('libera os players de vídeo do editor (iframe) e mídia por URL', () => {
      const csp = buildContentSecurityPolicy({ ...base, isDevelopment: false });
      expect(csp).toContain(
         'frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com'
      );
      expect(csp).toContain("media-src 'self' https:");
   });
});
