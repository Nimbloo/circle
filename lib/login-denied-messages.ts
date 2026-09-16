import type { LoginDecision } from '@/lib/api/login-gate';

/**
 * Mensagem por motivo de recusa de login.
 *
 * Fica FORA da página por dois motivos. Primeiro, testabilidade — mesma razão pela qual a
 * regra vive em `lib/api/login-gate.ts` e não dentro do callback. Segundo, e mais
 * importante: sendo um `Record` sobre o tipo do próprio `LoginDecision`, **acrescentar um
 * motivo novo ao gate sem escrever a mensagem dele não compila**. A garantia é estrutural,
 * não um teste que alguém pode esquecer de rodar.
 *
 * Por que isto existe: até 16/09/2026 só `deactivated` tinha mensagem. `identity` e
 * `unauthorized` viravam o mesmo `AccessDenied` genérico do NextAuth — e uma pessoa sem
 * acesso concedido lia exatamente o mesmo que uma com e-mail não verificado. A
 * investigação de um caso desses foi parar no Keycloak e num deploy antes de alguém
 * descobrir que o acesso simplesmente nunca tinha sido concedido no Orbis.
 *
 * As mensagens dizem O QUE FAZER, não o que falhou. "Peça no Orbis" resolve; "não
 * autorizado" manda a pessoa perguntar no Slack.
 */
type MotivoDeRecusa = Extract<LoginDecision, { allowed: false }>['reason'];

const MENSAGENS: Record<MotivoDeRecusa, string> = {
   identity:
      'Não foi possível confirmar sua identidade Nimbloo. Entre com a conta @nimbloo.ai do Google.',
   deactivated: 'Sua conta foi desativada. Fale com um admin do workspace.',
   unauthorized: 'Você ainda não tem acesso ao Circle. Peça a liberação no Orbis.',
};

/**
 * Mensagem para o `?error=` da URL, ou `null` quando o código não é nosso — o NextAuth
 * também redireciona para cá com erros dele (`Configuration`, `OAuthCallback`), e para
 * esses a tela não inventa explicação.
 */
export function mensagemDeRecusa(codigo: string | null | undefined): string | null {
   if (!codigo) return null;
   return Object.hasOwn(MENSAGENS, codigo) ? MENSAGENS[codigo as MotivoDeRecusa] : null;
}
