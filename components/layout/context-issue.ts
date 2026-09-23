'use client';

import type { Issue } from '@/data/issues';
import type { MeDto } from '@/lib/api/users';
import { useIssuesStore } from '@/store/issues-store';
import { useNotificationsStore } from '@/store/notifications-store';
import { useCatalogStore } from '@/store/catalog-store';
import { usePreferencesStore } from '@/store/preferences-store';

/**
 * Issue "em contexto" para os atalhos e o ⌘K: a do detalhe (`/org/issue/ENG-1`) ou a da
 * notificação aberta no preview do inbox (que mostra a issue completa).
 */
export function contextIssueIdentifier(
   pathname: string,
   selectedNotificationIdentifier?: string
): string | undefined {
   const detail = pathname.match(/^\/[^/]+\/issue\/([^/]+)/);
   if (detail) return decodeURIComponent(detail[1]);
   if (/^\/[^/]+\/inbox(?:\/|$)/.test(pathname)) return selectedNotificationIdentifier;
   return undefined;
}

/** Leitura pontual (handler de teclado): não assina os stores. */
export function getContextIssue(pathname: string): Issue | undefined {
   const identifier = contextIssueIdentifier(
      pathname,
      useNotificationsStore.getState().selectedNotification?.identifier
   );
   if (!identifier) return undefined;
   return useIssuesStore.getState().issues.find((issue) => issue.identifier === identifier);
}

/** Versão reativa (⌘K aberto): acompanha a issue e a seleção do inbox. */
export function useContextIssue(pathname: string): Issue | undefined {
   const selected = useNotificationsStore((s) => s.selectedNotification?.identifier);
   const identifier = contextIssueIdentifier(pathname, selected);
   return useIssuesStore((s) =>
      identifier ? s.issues.find((issue) => issue.identifier === identifier) : undefined
   );
}

export function issueUrl(orgId: string, identifier: string): string {
   const origin = typeof window !== 'undefined' ? window.location.origin : '';
   return `${origin}/${orgId}/issue/${identifier}`;
}

/** Branch no formato do Linear: `<usuário atual>/<id>-<título>`. */
export function issueBranchName(issue: Pick<Issue, 'identifier' | 'title'>, me: MeDto | null) {
   return `${me?.githubLogin || me?.slug || 'me'}/${issue.identifier.toLowerCase()}-${issue.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)}`;
}

/**
 * Preferências "On git branch copy / On copy as prompt, move issue to started status":
 * depois de copiar, uma issue ainda não iniciada (backlog/unstarted) vai para o 1º status
 * `started` do workflow. Branch: todos os "Copy git branch" (menu, ⌘K, atalho); prompt:
 * o "Copy as prompt" do ⌘K.
 */
export function startIssueOnBranchCopy(issue: Pick<Issue, 'id' | 'status'>): void {
   if (usePreferencesStore.getState().gitBranchCopyMoveStarted) moveToStarted(issue);
}

export function startIssueOnPromptCopy(issue: Pick<Issue, 'id' | 'status'>): void {
   if (usePreferencesStore.getState().openCodingToolMoveStarted) moveToStarted(issue);
}

function moveToStarted(issue: Pick<Issue, 'id' | 'status'>): void {
   if (issue.status.category !== 'backlog' && issue.status.category !== 'unstarted') return;
   const started = useCatalogStore.getState().statuses.find((s) => s.category === 'started');
   if (!started) return;
   // Erro já vira rollback + toast no store.
   void useIssuesStore
      .getState()
      .updateIssueStatus(issue.id, started)
      .catch(() => {});
}
