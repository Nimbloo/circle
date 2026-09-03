'use client';

import type { Issue } from '@/data/issues';
import type { IssueDetail } from '@/data/issue-details';
import { adaptIssueDetail, textToBlocks } from '@/lib/adapters-issue-detail';
import { adaptIssues } from '@/lib/adapters';
import { api } from '@/lib/client';
import { blocksToDoc, type EditorDoc } from '@/lib/editor-doc';
import { ISSUE_CHANGED_EVENT } from '@/lib/use-live-sync';
import { useIssuesStore } from '@/store/issues-store';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DetailSidePanel, DetailSidePanelTrigger } from '@/components/common/detail-side-panel';
import { BlockEditor } from '@/components/common/editor/block-editor';
import { AssigneeUser } from '../assignee-user';
import { ActivityFeed } from './activity-feed';
import { IssuePropertiesPanel } from './issue-properties-panel';
import { IssueDetailSkeleton } from './issue-detail-skeleton';
import { RelationEditor } from './relation-editor';
import { SubIssueCreate } from './sub-issue-create';

interface IssueDetailViewProps {
   issue: Issue;
   /** Conteúdo extra no topo da coluna principal (ex.: contexto da notificação no inbox). */
   banner?: ReactNode;
}

/**
 * Corpo COMPLETO da issue (padrão Linear): título e descrição editáveis inline,
 * sub-issues, activity feed com composer e a sidebar de properties. Reutilizado
 * pela página da issue e pelo preview do inbox — no Linear, selecionar uma
 * notificação abre a issue inteira, não um resumo read-only.
 *
 * A sidebar é o `DetailSidePanel` compartilhado (400px no desktop, Sheet no mobile,
 * aberto/fechado pelo `detail-panel-store`), o mesmo de initiative e project; o
 * conteúdo ocupa a largura restante, centralizado nos 791px medidos no Linear.
 */
export function IssueDetailView({ issue, banner }: IssueDetailViewProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const issues = useIssuesStore((s) => s.issues);
   const inStore = useIssuesStore((s) => s.issues.some((i) => i.id === issue.id));

   const [detail, setDetail] = useState<IssueDetail | null>(null);
   const [loading, setLoading] = useState(true);
   const [reloadKey, setReloadKey] = useState(0);

   // Edição inline do título (padrão Linear). A descrição é o editor de blocos, sempre
   // editável: `descriptionDoc` é o doc do servidor ou, quando ele ainda não existe, a
   // conversão da projeção em texto (`textToBlocks` → `blocksToDoc`).
   const [editingTitle, setEditingTitle] = useState(false);
   const [titleDraft, setTitleDraft] = useState('');
   const [descriptionDoc, setDescriptionDoc] = useState<EditorDoc | null>(null);
   // Override local do título para issue FORA do store (deep-link frio): o objeto vem
   // do pai e não flui de volta — o override exibe o valor salvo até o store assumir.
   const [localTitle, setLocalTitle] = useState<string | null>(null);

   // Ao trocar DE issue, volta ao skeleton. Depende do id (não do objeto): o splice do
   // SSE (applyRemote) troca a referência da issue no store e antes disparava um
   // refetch + skeleton em tela cheia a cada update — o "refresh completo" da página.
   const detailIssueId = issue.id;
   useEffect(() => {
      setDetail(null);
      setLoading(true);
      setLocalTitle(null);
      setEditingTitle(false);
      setDescriptionDoc(null);
   }, [detailIssueId]);

   useEffect(() => {
      if (!detailIssueId) return;
      let active = true;
      // Refetch silencioso (stale-while-revalidate): o conteúdo atual permanece na tela
      // enquanto o novo detail chega — skeleton só na primeira carga (detail === null).
      Promise.all([api.issues.detail(detailIssueId), api.issues.activity(detailIssueId)])
         .then(([detailDto, activity]) => {
            if (active) {
               setDetail(adaptIssueDetail(detailDto, activity));
               setDescriptionDoc(
                  detailDto.descriptionDoc ?? blocksToDoc(textToBlocks(detailDto.description))
               );
            }
         })
         .catch(() => {
            // mantém o conteúdo atual se já havia (erro só derruba a primeira carga)
         })
         .finally(() => {
            if (active) setLoading(false);
         });
      return () => {
         active = false;
      };
   }, [detailIssueId, reloadKey]);

   // Realtime: quando o SSE avisa que esta issue mudou (comment/reaction/relation de
   // OUTRO usuário), refaz o fetch do detail/feed. Sem isso, o painel aberto fica stale.
   useEffect(() => {
      const onChanged = (e: Event) => {
         const id = (e as CustomEvent<{ id?: string }>).detail?.id;
         if (!id || id === detailIssueId) setReloadKey((k) => k + 1);
      };
      window.addEventListener(ISSUE_CHANGED_EVENT, onChanged);
      return () => window.removeEventListener(ISSUE_CHANGED_EVENT, onChanged);
   }, [detailIssueId]);

   const displayTitle = inStore ? issue.title : (localTitle ?? issue.title);

   if (loading || !detail) {
      // Loading → skeleton; erro real (não-loading, sem detail) → mensagem.
      if (loading) return <IssueDetailSkeleton />;
      return (
         <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Could not load issue details.
         </div>
      );
   }

   const subIssues = (detail.subIssueIds ?? [])
      .map((id) => issues.find((candidate) => candidate.id === id))
      .filter((candidate) => candidate !== undefined);

   // Persiste o título: pelo store (optimistic+rollback) quando a issue está no board,
   // ou direto na API + override local quando é deep-link frio (fora do store).
   const applyTitle = async () => {
      const next = titleDraft.trim();
      setEditingTitle(false);
      if (!next || next === displayTitle) return;
      if (inStore) {
         useIssuesStore.getState().updateIssue(issue.id, { title: next });
      } else {
         setLocalTitle(next);
         try {
            await api.issues.update(issue.id, { title: next });
         } catch {
            setLocalTitle(null);
            toast.error('Falha ao salvar o título');
         }
      }
   };

   // O editor já mostra o que o usuário digitou; só o erro precisa de feedback (sem
   // toast de sucesso — o save é contínuo, com debounce).
   const saveDescription = async (doc: EditorDoc) => {
      try {
         await api.issues.updateDetail(issue.id, { descriptionDoc: doc });
      } catch {
         toast.error('Falha ao salvar a descrição');
      }
   };

   return (
      <div className="flex h-full w-full overflow-hidden">
         {/* Main column — conteúdo centralizado nos 791px medidos no Linear. */}
         <article className="h-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-8 sm:px-8 sm:py-10 xl:pt-[59px]">
            <div className="mx-auto w-full max-w-[791px]">
               <div className="mb-5 flex justify-end xl:hidden">
                  <DetailSidePanelTrigger kind="issue" />
               </div>
               {banner}
               {editingTitle ? (
                  <textarea
                     autoFocus
                     value={titleDraft}
                     onChange={(e) => setTitleDraft(e.target.value)}
                     onBlur={() => void applyTitle()}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                           e.preventDefault();
                           void applyTitle();
                        } else if (e.key === 'Escape') {
                           setEditingTitle(false);
                        }
                     }}
                     rows={1}
                     className="w-full resize-none bg-transparent text-2xl font-semibold leading-8 outline-none"
                  />
               ) : (
                  <h1
                     className="cursor-text rounded-md text-2xl font-semibold leading-8 text-balance transition-colors hover:bg-accent/20"
                     onClick={() => {
                        setTitleDraft(displayTitle);
                        setEditingTitle(true);
                     }}
                  >
                     {displayTitle}
                  </h1>
               )}

               <div className="mt-6 min-h-8">
                  <BlockEditor
                     key={issue.id}
                     doc={descriptionDoc}
                     placeholder="Add a description…"
                     onSave={saveDescription}
                     context={
                        issue.teamId
                           ? {
                                issueId: issue.id,
                                teamId: issue.teamId,
                                projectId: issue.project?.id ?? null,
                             }
                           : undefined
                     }
                  />
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
                  <div className="flex flex-col gap-0.5">
                     <SubIssueCreate
                        parentId={issue.id}
                        teamId={issue.teamId}
                        projectId={issue.project?.id ?? null}
                        onCreated={() => setReloadKey((k) => k + 1)}
                     />
                     <RelationEditor
                        issueId={issue.id}
                        kind="sub"
                        relatedIds={detail.subIssueIds ?? []}
                        addLabel="Link existing issue"
                        renderList={false}
                        onChanged={() => setReloadKey((k) => k + 1)}
                     />
                  </div>
               </div>

               <div className="border-t border-border/60 mt-8" />

               <ActivityFeed
                  activity={detail.activity}
                  issueId={issue.id}
                  onCommentAdded={() => setReloadKey((k) => k + 1)}
               />
            </div>
         </article>

         {/* Properties sidebar — 400px, mesmo painel de initiative e project. */}
         <DetailSidePanel
            kind="issue"
            title="Issue details"
            description="View and edit the properties of this issue."
         >
            <div className="h-full w-full overflow-y-auto px-5 py-5 xl:pt-[21px]">
               <IssuePropertiesPanel
                  issue={issue}
                  detail={detail}
                  onChanged={() => setReloadKey((k) => k + 1)}
               />
            </div>
         </DetailSidePanel>
      </div>
   );
}

/**
 * Issue detail page (rota /issue/[issueId]): resolve a issue pelo identifier
 * (store ou API no deep-link frio) e renderiza o corpo completo.
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

   if (!issue) {
      // Ainda resolvendo o deep-link → skeleton (não "not found" prematuro).
      if (resolvingIssue) return <IssueDetailSkeleton />;
      return (
         <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
            <p>Issue {issueId} not found.</p>
            <Link href={`/${orgId ?? 'nimbloo'}`} className="underline">
               Back to issues
            </Link>
         </div>
      );
   }

   return <IssueDetailView issue={issue} />;
}
