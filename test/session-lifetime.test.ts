import { describe, it, expect } from 'vitest';
import { authConfig } from '@/auth.config';

/**
 * SSO total: o acesso é o grupo `app-circle` no Keycloak, conferido a cada login. O
 * tempo de sessão é, portanto, o teto de propagação de uma REVOGAÇÃO — sem `maxAge` o
 * NextAuth usa 30 dias e tirar alguém do grupo não derrubava a sessão viva.
 *
 * Este teste trava o teto: se alguém afrouxar (ou remover) o `maxAge`, o "tirar usuário"
 * volta a demorar semanas e nada mais acusaria.
 */
const OITO_HORAS = 8 * 60 * 60;

describe('tempo de sessão x propagação da revogação', () => {
   it('a sessão é limitada, e no máximo a um dia de trabalho', () => {
      expect(authConfig.session?.strategy).toBe('jwt');
      expect(authConfig.session?.maxAge).toBeDefined();
      expect(authConfig.session!.maxAge).toBeLessThanOrEqual(OITO_HORAS);
   });
});
