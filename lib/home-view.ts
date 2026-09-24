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

/**
 * Destino da landing da org, relativo a `/[orgId]/`: preferência → 1º time do qual o
 * usuário é membro (por nome) → convidado vai para My issues → 1º time existente → criar
 * time. Pura: o servidor (`orgLandingPath`) e o cliente (Back to app, sair/excluir time)
 * usam a MESMA regra — o cliente navega direto, sem depender do `redirect()` de `/[orgId]`.
 */
export function landingPath(input: {
   homeView: unknown;
   role: string | null | undefined;
   teams: readonly { id: string; name: string; joined: boolean }[];
}): string {
   const preferred = homeViewPath(input.homeView);
   if (preferred) return preferred;
   const byName = [...input.teams].sort((a, b) => a.name.localeCompare(b.name));
   const joined = byName.find((t) => t.joined);
   if (joined) return `team/${joined.id}/all`;
   if (input.role === 'Guest') return 'my-issues';
   return byName.length > 0 ? `team/${byName[0].id}/all` : 'settings/teams/new';
}
