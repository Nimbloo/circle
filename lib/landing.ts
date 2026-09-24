'use client';

import { landingPath } from '@/lib/home-view';
import { usePreferencesStore } from '@/store/preferences-store';
import { useWorkspaceStore } from '@/store/workspace-store';

type LandingState = {
   me: { role: string; teamIds: string[] } | null;
   teams: readonly { id: string; name: string }[];
};

/**
 * Landing da org resolvida no cliente (mesma regra do servidor, `landingPath`). Navegar
 * direto para ela, em vez de `/[orgId]` + `redirect()` do servidor, é o que tira o usuário
 * das settings no Back to app e depois de sair/excluir um time. Sem time nenhum a regra
 * do servidor manda para "criar time" — dentro de settings; aqui vai para My issues, que
 * sempre existe, senão o usuário não consegue sair de settings.
 */
function resolve(orgId: string, { me, teams }: LandingState, homeView: unknown): string {
   // Workspace ainda não hidratado: sem dado para decidir, fica com o redirect do servidor.
   if (!me) return `/${orgId}`;
   const joined = new Set(me.teamIds);
   const path = landingPath({
      homeView,
      role: me.role,
      teams: teams.map((t) => ({ id: t.id, name: t.name, joined: joined.has(t.id) })),
   });
   return `/${orgId}/${path.startsWith('settings/') ? 'my-issues' : path}`;
}

/** Lida na hora da chamada: use depois de mutar o store (ex.: logo após excluir o time). */
export function landingHref(orgId: string): string {
   return resolve(
      orgId,
      useWorkspaceStore.getState(),
      usePreferencesStore.getState().defaultHomeView
   );
}

/** Versão reativa, para o `href` de um Link. */
export function useLandingHref(orgId: string): string {
   const me = useWorkspaceStore((s) => s.me);
   const teams = useWorkspaceStore((s) => s.teams);
   const homeView = usePreferencesStore((s) => s.defaultHomeView);
   return resolve(orgId, { me, teams }, homeView);
}
