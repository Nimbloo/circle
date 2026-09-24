/**
 * Fim de sessão (#12) — sem dependência de `next/*` nem de `lib/api/*`: compartilhado
 * pelo middleware (Edge), pelo cliente e pelo servidor. `window` só é tocado dentro das
 * funções de navegador.
 */

/** Mensagem única do 403 de conta desativada — o cliente reconhece por ela. */
export const DEACTIVATED_MESSAGE = 'Conta desativada';

/** Tela própria da conta desativada: o login mostra a mensagem do motivo `deactivated`. */
export const DEACTIVATED_LOGIN_URL = '/login?error=deactivated';

/**
 * `/login` com o deep-link em `callbackUrl`, para voltar ao mesmo lugar depois de entrar.
 * A página de login só aceita caminho relativo (anti open-redirect).
 */
export function loginRedirectUrl(pathname: string, search = ''): string {
   const target = `${pathname}${search}`;
   if (!pathname || pathname === '/' || pathname.startsWith('/login')) return '/login';
   return `/login?callbackUrl=${encodeURIComponent(target)}`;
}

/**
 * Estado do fim de sessão no navegador (#12): 401 leva ao login com o deep-link; 403 de
 * conta desativada vai à tela própria. Uma vez só — várias requests falhando juntas não
 * empilham redirects — e `isSessionEnded()` avisa o live-sync para parar de reconectar.
 */
let sessionEnded = false;
let sessionRedirect: (url: string) => void = (url) => window.location.assign(url);
const sessionListeners = new Set<() => void>();

/** Avisa quando a sessão acaba (o Toaster some: nada de toast de erro antes do redirect). */
export function subscribeSessionEnded(listener: () => void): () => void {
   sessionListeners.add(listener);
   return () => sessionListeners.delete(listener);
}

export function isSessionEnded(): boolean {
   return sessionEnded;
}

export function endSession(url: string): void {
   if (sessionEnded || typeof window === 'undefined') return;
   sessionEnded = true;
   sessionListeners.forEach((listener) => listener());
   sessionRedirect(url);
}

/** Teste: troca o redirect (jsdom não navega) e zera o estado de sessão. */
export function __setSessionRedirectForTest(fn: ((url: string) => void) | null): void {
   sessionEnded = false;
   sessionListeners.forEach((listener) => listener());
   sessionRedirect = fn ?? ((url) => window.location.assign(url));
}
