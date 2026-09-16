import { describe, it, expect } from 'vitest';
import { mensagemDeRecusa } from '@/lib/login-denied-messages';

/**
 * Recusa de login precisa DIZER O MOTIVO.
 *
 * Incidente de 16/09/2026: uma pessoa levou `AccessDenied` ao entrar no Circle e a
 * investigação foi parar no Keycloak — fluxo de first broker login, `emailVerified`,
 * `syncMode` do IdP, dois deploys — quando o motivo era `unauthorized`: o acesso ao Circle
 * nunca tinha sido concedido no Orbis. O gate SABIA disso e jogava fora, porque só
 * `deactivated` virava mensagem e os outros dois motivos colapsavam num `false`.
 *
 * O que estes testes travam é a distinção. Se um dia duas recusas diferentes voltarem a
 * dizer a mesma coisa, cai aqui.
 */
describe('mensagem de recusa de login', () => {
   it('sem acesso concedido manda a pessoa ao lugar que resolve', () => {
      const msg = mensagemDeRecusa('unauthorized');
      expect(msg).toContain('Orbis');
      // "não autorizado" faria a pessoa perguntar no Slack; o nome do lugar faz ela resolver.
      expect(msg).toMatch(/acesso ao Circle/i);
   });

   it('os três motivos dizem coisas DIFERENTES', () => {
      const msgs = ['identity', 'deactivated', 'unauthorized'].map(mensagemDeRecusa);
      expect(msgs.every((m) => typeof m === 'string' && m.length > 0)).toBe(true);
      // O defeito era exatamente este: mensagens iguais para causas diferentes.
      expect(new Set(msgs).size).toBe(3);
   });

   it('código de erro que não é nosso não ganha explicação inventada', () => {
      // O NextAuth redireciona pra cá com erros DELE (`Configuration`, `OAuthCallback`).
      expect(mensagemDeRecusa('Configuration')).toBeNull();
      expect(mensagemDeRecusa('OAuthCallback')).toBeNull();
      expect(mensagemDeRecusa(null)).toBeNull();
      expect(mensagemDeRecusa('')).toBeNull();
   });

   it('não vaza chave herdada de Object.prototype', () => {
      // Lookup cru num objeto (`MENSAGENS[codigo]`) devolveria a função `toString` aqui.
      expect(mensagemDeRecusa('toString')).toBeNull();
      expect(mensagemDeRecusa('constructor')).toBeNull();
   });
});
