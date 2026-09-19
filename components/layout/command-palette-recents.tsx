'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useIssuesStore } from '@/store/issues-store';
import { useRecentsStore } from '@/store/recents-store';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * Registro de "recentes" (grupo "Recently viewed" do ⌘K): grava a issue/projeto da rota
 * atual. Separado do corpo da paleta (#51) e com seletores ESTREITOS — só a entidade da
 * rota; antes assinava todas as issues e projetos e re-rodava a cada mutação.
 */
export function useRecordRecents(): void {
   const pathname = usePathname();
   const issueIdentifier = pathname.match(/^\/[^/]+\/issue\/([^/]+)/)?.[1];
   const projectId = pathname.match(/^\/[^/]+\/project\/([^/]+)/)?.[1];
   const issue = useIssuesStore((s) =>
      issueIdentifier ? s.issues.find((i) => i.identifier === issueIdentifier) : undefined
   );
   const project = useWorkspaceStore((s) =>
      projectId ? s.projects.find((p) => p.id === projectId) : undefined
   );
   const pushRecent = useRecentsStore((s) => s.push);
   const owner = useRecentsOwner();
   // Guarda o último gravado: re-render da mesma entidade (edição) não re-grava.
   const lastPushedRef = useRef('');

   const issueRecent = issue
      ? { type: 'issue' as const, id: issue.id, label: issue.title, identifier: issue.identifier }
      : null;
   const projectRecent = project
      ? { type: 'project' as const, id: project.id, label: project.name }
      : null;
   const recent = issueIdentifier ? issueRecent : projectRecent;
   const key = recent ? `${recent.type}:${recent.id}` : '';

   useEffect(() => {
      // Grava quando a entidade da rota hidrata (auto-heal de deep-link frio).
      if (!recent || !owner || lastPushedRef.current === `${owner}|${key}`) return;
      lastPushedRef.current = `${owner}|${key}`;
      pushRecent(owner, recent);
      // `recent` é derivado de `key` + entidade; gravar de novo só quando a chave muda.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [key, owner, pushRecent]);
}

/** Dono dos recentes: `${orgId}:${userId}`; null até o `me` chegar (não grava anônimo). */
export function useRecentsOwner(): string | null {
   const pathname = usePathname();
   const meId = useWorkspaceStore((s) => s.me?.id);
   const orgId = pathname.split('/')[1] || 'nimbloo';
   return meId ? `${orgId}:${meId}` : null;
}

/** Monta o registro de recentes sem renderizar nada. */
export function RecentsRecorder() {
   useRecordRecents();
   return null;
}
