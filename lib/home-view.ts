/**
 * Opções da preferência "Default home view" (Settings → Preferences) e a rota de
 * cada uma, relativa a `/[orgId]/`. `Team issues` é o comportamento de sempre (1º time
 * do usuário, regra em `orgLandingPath`) e é o default: valores desconhecidos ou
 * legados (ex.: o antigo `Agent (default)`) caem nele.
 */
export const HOME_VIEW_OPTIONS = ['Team issues', 'My issues', 'Inbox', 'Agent'] as const;
export type HomeView = (typeof HOME_VIEW_OPTIONS)[number];
export const DEFAULT_HOME_VIEW: HomeView = 'Team issues';

const FIXED_PATHS: Partial<Record<HomeView, string>> = {
   'My issues': 'my-issues',
   'Inbox': 'inbox',
   'Agent': 'agent',
};

/** Rota fixa da view escolhida; `null` = usar a regra do time (default). */
export function homeViewPath(value: unknown): string | null {
   return typeof value === 'string' ? (FIXED_PATHS[value as HomeView] ?? null) : null;
}
