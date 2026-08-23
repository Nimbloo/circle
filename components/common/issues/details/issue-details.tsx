'use client';

import type { Issue } from '@/data/issues';
import type { IssueDetail } from '@/data/issue-details';
import { adaptIssueDetail } from '@/lib/adapters-issue-detail';
import { adaptIssues } from '@/lib/adapters';
import { api } from '@/lib/client';
import { ISSUE_CHANGED_EVENT } from '@/lib/use-live-sync';
import { useIssuesStore } from '@/store/issues-store';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AssigneeUser } from '../assignee-user';
import { ActivityFeed } from './activity-feed';
import { ContentBlocks } from './content-blocks';
import { IssuePropertiesPanel } from './issue-properties-panel';
import { RelationEditor } from './relation-editor';

/**
 * Issue detail page: rich description, sub-issues, activity feed and a
 * properties sidebar — Linear-style.
 */
export default function IssueDetails() {
   const { orgId, issueId } = useParams<{ orgId: string; issueId: string }>();
   const issues = useIssuesStore((s) => s.issues);

   // Issue do store (se já hidratado) — reusa sem request.
   const storeIssue = useMemo(
      () => issues.find((candidate) => candidate.identifier === issueId),
      [issues, issueId]
   );
   // Fallback: se o deep-link foi aberto direto (store ainda vazio), busca a issue por
   // identifier na API — sem esperar o board inteiro hidratar (fim do waterfall de ~500).
   // undefined = ainda buscando; null = buscou e não existe; Issue = encontrada.
   const [fetchedIssue, setFetchedIssue] = useState<Issue | null | undefined>(undefined);
   const issue = storeIssue ?? fetchedIssue ?? undefined;
   const resolvingIssue = !storeIssue && fetchedIssue === undefined;

   const [detail, setDetail] = useState<IssueDetail | null>(null);
   const [loading, setLoading] = useState(true);
   const [reloadKey, setReloadKey] = useState(0);

   useEffect(() => {
      if (storeIssue) return; // já temos a issue no store
      let active = true;
      // Reset ao trocar de issueId (navegação entre deep-links) → volta a "Carregando…"
      // em vez de mostrar a issue anterior sob a nova URL enquanto o GET não resolve.
      setFetchedIssue(undefined);
      api.issues
         .get(issueId)
         .then((dto) => {
            if (active) setFetchedIssue(adaptIssues([dto])[0]);
         })
         .catch(() => {
            if (active) setFetchedIssue(null);
         });
      return () => {
         active = false;
      };
   }, [issueId, storeIssue]);

   useEffect(() => {
      if (!issue) return;
      let active = true;
      setLoading(true);
      Promise.all([api.issues.detail(issue.id), api.issues.activity(issue.id)])
         .then(([detailDto, activity]) => {
            if (active) setDetail(adaptIssueDetail(detailDto, activity));
         })
         .catch(() => {
            if (active) setDetail(null);
         })
         .finally(() => {
            if (active) setLoading(false);
         });
      return () => {
         active = false;
      };
   }, [issue, reloadKey]);

   // Realtime: quando o SSE avisa que esta issue mudou (comment/reaction/relation de
   // OUTRO usuário), refaz o fetch do detail/feed. Sem isso, o painel aberto fica stale.
   useEffect(() => {
      if (!issue) return;
      const onChanged = (e: Event) => {
         const id = (e as CustomEvent<{ id?: string }>).detail?.id;
         if (!id || id === issue.id) setReloadKey((k) => k + 1);
      };
      window.addEventListener(ISSUE_CHANGED_EVENT, onChanged);
      return () => window.removeEventListener(ISSUE_CHANGED_EVENT, onChanged);
   }, [issue]);

   if (!issue) {
      // Ainda resolvendo o deep-link → loading (não "not found" prematuro).
      if (resolvingIssue) {
         return (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
               Carregando…
            </div>
         );
      }
      return (
         <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
            <p>Issue {issueId} not found.</p>
            <Link href={`/${orgId ?? 'nimbloo'}`} className="underline">
               Back to issues
            </Link>
         </div>
      );
   }

   if (loading || !detail) {
      return (
         <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {loading ? 'Loading…' : 'Could not load issue details.'}
         </div>
      );
   }

   const subIssues = (detail.subIssueIds ?? [])
      .map((id) => issues.find((candidate) => candidate.id === id))
      .filter((candidate) => candidate !== undefined);

   return (
      <div className="w-full h-full flex overflow-hidden">
         {/* Main column */}
         <div className="flex-1 min-w-0 h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-10">
               <h1 className="text-3xl font-semibold leading-tight text-balance">{issue.title}</h1>

               <div className="mt-6">
                  <ContentBlocks blocks={detail.description} />
               </div>

               {/* Sub-issues */}
               <div className="mt-8">
                  {subIssues.length > 0 && (
                     <>
                        <h2 className="text-sm font-medium mb-1">
                           Sub-issues{' '}
                           <span className="text-muted-foreground">
                              {
                                 subIssues.filter(
                                    (subIssue) => subIssue.status.category === 'completed'
                                 ).length
                              }
                              /{subIssues.length}
                           </span>
                        </h2>
                        <div className="flex flex-col border-t border-border/50 mb-2">
                           {subIssues.map((subIssue) => (
                              <Link
                                 key={subIssue.id}
                                 href={`/${orgId ?? 'nimbloo'}/issue/${subIssue.identifier}`}
                                 className="flex items-center gap-2.5 h-10 px-1 border-b border-border/50 hover:bg-sidebar/50 text-sm min-w-0"
                              >
                                 <subIssue.status.icon />
                                 <span className="text-muted-foreground shrink-0 text-xs font-medium">
                                    {subIssue.identifier}
                                 </span>
                                 <span className="truncate font-medium">{subIssue.title}</span>
                                 <span className="ml-auto shrink-0">
                                    <AssigneeUser user={subIssue.assignee} issueId={subIssue.id} />
                                 </span>
                              </Link>
                           ))}
                        </div>
                     </>
                  )}
                  {/* Add-only: a lista rica acima já exibe os subs; o picker cria a relação
                      `sub` (filtrando os já vinculados via relatedIds) e refetch no onChanged. */}
                  <RelationEditor
                     issueId={issue.id}
                     kind="sub"
                     relatedIds={detail.subIssueIds ?? []}
                     addLabel="Add sub-issues"
                     renderList={false}
                     onChanged={() => setReloadKey((k) => k + 1)}
                  />
               </div>

               <div className="border-t border-border/60 mt-8" />

               <ActivityFeed
                  activity={detail.activity}
                  issueId={issue.id}
                  onCommentAdded={() => setReloadKey((k) => k + 1)}
               />
            </div>
         </div>

         {/* Properties sidebar */}
         <aside className="hidden lg:block w-80 shrink-0 border-l h-full overflow-y-auto bg-container px-5 py-6">
            <IssuePropertiesPanel
               issue={issue}
               detail={detail}
               onChanged={() => setReloadKey((k) => k + 1)}
            />
         </aside>
      </div>
   );
}
