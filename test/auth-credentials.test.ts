import { describe, it, expect } from 'vitest';
import { isAllowedKeycloakProfile, ALLOWED_EMAIL_DOMAIN, REQUIRED_GROUP } from '@/auth.config';

function profile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
   return {
      email: 'ana.silva@nimbloo.ai',
      email_verified: true,
      groups: [REQUIRED_GROUP],
      ...overrides,
   };
}

describe('isAllowedKeycloakProfile (gate do login Keycloak, provider único)', () => {
   it('permite quando o e-mail é do domínio, verificado, e o grupo app-circle está presente', () => {
      expect(isAllowedKeycloakProfile(profile())).toBe(true);
   });

   it('aceita o grupo tanto como "app-circle" quanto como full group path "/app-circle"', () => {
      expect(isAllowedKeycloakProfile(profile({ groups: ['/app-circle'] }))).toBe(true);
   });

   it('nega quando o grupo app-circle está ausente entre outros grupos', () => {
      expect(isAllowedKeycloakProfile(profile({ groups: ['app-other', 'app-dcr'] }))).toBe(false);
   });

   it('nega quando o claim groups está ausente do ID token (fail-closed)', () => {
      const p = profile();
      delete p.groups;
      expect(isAllowedKeycloakProfile(p)).toBe(false);
   });

   it('nega quando groups vem vazio', () => {
      expect(isAllowedKeycloakProfile(profile({ groups: [] }))).toBe(false);
   });

   it('nega quando o domínio do e-mail não é @nimbloo.ai', () => {
      expect(isAllowedKeycloakProfile(profile({ email: 'ana.silva@gmail.com' }))).toBe(false);
   });

   it('nega quando o e-mail não foi verificado pelo Keycloak', () => {
      expect(isAllowedKeycloakProfile(profile({ email_verified: false }))).toBe(false);
   });

   it('nega profile nulo/indefinido ou sem e-mail', () => {
      expect(isAllowedKeycloakProfile(null)).toBe(false);
      expect(isAllowedKeycloakProfile(undefined)).toBe(false);
      expect(isAllowedKeycloakProfile(profile({ email: undefined }))).toBe(false);
   });

   it('exporta o domínio e o grupo esperados (documentação viva do gate)', () => {
      expect(ALLOWED_EMAIL_DOMAIN).toBe('@nimbloo.ai');
      expect(REQUIRED_GROUP).toBe('app-circle');
   });
});
