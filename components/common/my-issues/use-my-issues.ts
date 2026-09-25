'use client';

import { Issue } from '@/data/issues';
import { api } from '@/lib/client';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useState } from 'react';

export const MY_ISSUES_TABS = ['assigned', 'created', 'subscribed', 'activity'] as const;
export type MyIssuesTab = (typeof MY_ISSUES_TABS)[number];

export const MY_ISSUES_TAB_ITEMS: { label: string; value: MyIssuesTab }[] = [
   { label: 'Assigned', value: 'assigned' },
   { label: 'Created', value: 'created' },
   { label: 'Subscribed', value: 'subscribed' },
   { label: 'Activity', value: 'activity' },
];

/** Shared tab state (URL-backed) between the header and the page body. */
export function useMyIssuesTab() {
   return useQueryState('tab', parseAsStringLiteral(MY_ISSUES_TABS).withDefault('assigned'));
}

/**
 * Ids das issues com atividade minha (aba "Activity"). Busca sob demanda quando a
 * aba está ativa; usado tanto pelo header (contador) quanto pelo corpo (board) para
 * não divergir (is#17: o contador mostrava o total de "Subscribed" na aba Activity
 * por não ter esses ids).
 */
export interface MyIssuesActivity {
   activeIds: ReadonlySet<string>;
   /** A busca da aba ainda não respondeu (a tela mostra carregando, não "vazio"). */
   loading: boolean;
   /** A última busca falhou (a tela mostra erro com retry). */
   error: boolean;
   retry: () => void;
}

export function useMyIssuesActiveIds(tab: MyIssuesTab): MyIssuesActivity {
   const [activeIds, setActiveIds] = useState<ReadonlySet<string>>(new Set());
   const [attempt, setAttempt] = useState(0);
   // Qual tentativa já respondeu, e se falhou: `loading` é derivado (sem set no effect).
   const [settled, setSettled] = useState<{ attempt: number; error: boolean } | null>(null);
   // Reabrir a aba é uma busca nova: novo `attempt`, senão o resultado (ou erro) da busca
   // anterior casaria com ele e apareceria no lugar do carregando.
   const [prevTab, setPrevTab] = useState(tab);
   if (tab !== prevTab) {
      setPrevTab(tab);
      if (tab === 'activity') setAttempt((n) => n + 1);
   }
   useEffect(() => {
      if (tab !== 'activity') return;
      let alive = true;
      api.me
         .activity()
         .then((items) => {
            if (!alive) return;
            setActiveIds(new Set(items.map((i) => i.issueId)));
            setSettled({ attempt, error: false });
         })
         .catch(() => {
            if (alive) setSettled({ attempt, error: true });
         });
      return () => {
         alive = false;
      };
   }, [tab, attempt]);
   const current = settled?.attempt === attempt ? settled : null;
   return {
      activeIds,
      loading: tab === 'activity' && !current,
      error: tab === 'activity' && !!current?.error,
      retry: () => setAttempt((n) => n + 1),
   };
}

const isCreatedByMe = (issue: Issue, meId: string): boolean => issue.createdById === meId;

/** Sou responsável (principal OU colaborador, #96). */
const isAssignedToMe = (issue: Issue, meId: string): boolean =>
   (issue.assignees ?? []).some((a) => a.id === meId) || issue.assignee?.id === meId;

/**
 * Issues shown by each My issues tab. `meId` = usuário corrente (SSO);
 * `subscribedIds` = assinaturas REAIS (issue_subscription), não mais uma heurística.
 * A aba "Activity" tem feed próprio (activity-feed), não passa por aqui.
 * "Assigned" sai dos responsáveis das issues do store (principal e colaboradores).
 */
export function scopeMyIssues(
   issues: Issue[],
   tab: MyIssuesTab,
   meId: string | undefined,
   subscribedIds: ReadonlySet<string>,
   activeIds?: ReadonlySet<string>
): Issue[] {
   if (!meId) return [];
   switch (tab) {
      case 'assigned':
         return issues.filter((issue) => isAssignedToMe(issue, meId));
      case 'created':
         return issues.filter((issue) => isCreatedByMe(issue, meId));
      case 'activity':
         // "Activity" = issues em que EU estive ativo (padrão Linear, board de issues).
         // `activeIds` vem do /me/activity; sem ele (ex.: contador do header), aproxima
         // pelas assinadas.
         return issues.filter((issue) => (activeIds ?? subscribedIds).has(issue.id));
      case 'subscribed':
      default:
         return issues.filter((issue) => subscribedIds.has(issue.id));
   }
}
