'use client';

import type { Issue } from '@/data/issues';
import type { MeDto } from '@/lib/api/users';
import { useIssuesStore } from '@/store/issues-store';
import { useNotificationsStore } from '@/store/notifications-store';

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
