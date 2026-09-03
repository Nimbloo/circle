import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from '../lib/security/content-security-policy';

describe('content security policy', () => {
   it('permite o runtime de desenvolvimento do Next sem afrouxar produção', () => {
      const development = buildContentSecurityPolicy({
         cdnUrl: 'https://cdn.example.com',
         isDevelopment: true,
      });
      const production = buildContentSecurityPolicy({
         cdnUrl: 'https://cdn.example.com',
         isDevelopment: false,
      });

      expect(development).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
      expect(production).toContain("script-src 'self' 'unsafe-inline'");
      expect(production).not.toContain("'unsafe-eval'");
   });

   it('libera os players de vídeo do editor (iframe) e mídia por URL', () => {
      const csp = buildContentSecurityPolicy({
         cdnUrl: 'https://cdn.example.com',
         isDevelopment: false,
      });
      expect(csp).toContain(
         'frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com'
      );
      expect(csp).toContain("media-src 'self' https:");
   });
});
